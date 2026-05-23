import db from "../db.server";
import {
  PLANS,
  entitledQuota,
  normalizePlan,
  planKeyFromName,
  type PlanKey,
} from "./plans";

/**
 * Test-mode billing flag. Shopify won't charge real money for test charges.
 * Defaults to TEST so an unapproved app (and App Store reviewers) can never be
 * charged by accident. Opt into real billing explicitly with
 * `SHOPIFY_BILLING_TEST=false` once the listing is approved and you're ready to
 * charge real merchants.
 */
export const BILLING_TEST =
  process.env.SHOPIFY_BILLING_TEST != null
    ? process.env.SHOPIFY_BILLING_TEST === "true"
    : true;

/**
 * Whether the free early-access plan is still offered to NEW installs.
 * While open, new shops default to FREE and are grandfathered. Once the user
 * sets `FREE_PLAN_OPEN=false`, new shops default to BASIC with no active
 * charge (quota 0 until they subscribe). Existing FREE shops keep Free, since
 * `upsertShop` only sets the plan on create.
 */
export const FREE_PLAN_OPEN = process.env.FREE_PLAN_OPEN !== "false";

/** Plan key assigned to a brand-new shop at install time. */
export function defaultPlanForNewShop(): PlanKey {
  return FREE_PLAN_OPEN ? "FREE" : "BASIC";
}

/** Start of the current calendar month, in UTC. */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Completed try-ons for a shop this calendar month — the quota meter. */
export async function monthlyUsage(shopId: string): Promise<number> {
  return db.tryOn.count({
    where: { shopId, status: "COMPLETED", createdAt: { gte: monthStart() } },
  });
}

export interface PlanStatus {
  plan: PlanKey;
  planName: string;
  amount: number;
  /** True for a billable plan that has an active charge (or non-billable plans). */
  active: boolean;
  used: number;
  /** Entitled quota; null when unlimited (Custom). */
  quota: number | null;
  /** Remaining this month; null when unlimited. */
  remaining: number | null;
  unlimited: boolean;
  overQuota: boolean;
  /** A billable plan selected but not yet paid for (needs a subscription). */
  needsPayment: boolean;
}

/**
 * Build a serialisable plan/usage snapshot for the admin UI. Infinity is
 * collapsed to `null` + `unlimited: true` so it survives JSON serialization.
 */
export async function getPlanStatus(
  shopId: string,
  plan: string | null | undefined,
  chargeId: string | null | undefined,
): Promise<PlanStatus> {
  const key = normalizePlan(plan);
  const def = PLANS[key];
  const entitled = entitledQuota(plan, chargeId);
  const used = await monthlyUsage(shopId);
  const unlimited = !Number.isFinite(entitled);
  const active = def.billable ? Boolean(chargeId) : true;

  return {
    plan: key,
    planName: def.name,
    amount: def.amount,
    active,
    used,
    quota: unlimited ? null : entitled,
    remaining: unlimited ? null : Math.max(0, entitled - used),
    unlimited,
    overQuota: !unlimited && used >= entitled,
    needsPayment: def.billable && !chargeId,
  };
}

/**
 * Reconcile `Shop.plan`/`chargeId` with Shopify's billing reality.
 *
 * @param active the active subscription from `billing.check` (or null/none).
 * Called from the billing page loader and the `app_subscriptions/update`
 * webhook so storefront gating (which trusts the DB) stays accurate.
 */
export async function syncShopPlan(
  shopDomain: string,
  active: { id: string; name: string } | null,
): Promise<{ plan: PlanKey; chargeId: string | null }> {
  if (active) {
    const plan = planKeyFromName(active.name) ?? "FREE";
    await db.shop.updateMany({
      where: { shopDomain },
      data: { plan, chargeId: active.id },
    });
    return { plan, chargeId: active.id };
  }

  // No active paid subscription. Don't disturb a manually-set Custom plan.
  const shop = await db.shop.findUnique({
    where: { shopDomain },
    select: { plan: true },
  });
  if (normalizePlan(shop?.plan) === "CUSTOM") {
    return { plan: "CUSTOM", chargeId: null };
  }

  // Fall back to the current entry tier: Free while early-access is open,
  // otherwise an unpaid Basic (which gates the storefront until they subscribe).
  const plan = defaultPlanForNewShop();
  await db.shop.updateMany({
    where: { shopDomain },
    data: { plan, chargeId: null },
  });
  return { plan, chargeId: null };
}
