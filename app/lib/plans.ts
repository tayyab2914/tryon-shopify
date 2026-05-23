/**
 * Plan catalog — the single source of truth for TryOn's pricing tiers.
 *
 * Pure data + helpers, with NO server-only imports, so it can be used by both
 * the storefront/server gating (`billing.server.ts`, `api.tryon.tsx`) and the
 * embedded admin UI (`app.billing.tsx`).
 *
 * The `name` of each billable plan MUST exactly match the key used in the
 * `billing` config in `app/shopify.server.ts` and the Shopify subscription
 * name returned by `billing.check`.
 */

export type PlanKey = "FREE" | "BASIC" | "PRO" | "PLATINUM" | "CUSTOM";

export interface PlanDef {
  key: PlanKey;
  /** Display name. For billable plans this is also the Shopify billing id. */
  name: string;
  /** Monthly price in USD. 0 for Free / Custom. */
  amount: number;
  /** Included completed try-ons per calendar month. Infinity = unlimited. */
  quota: number;
  /** True when the plan maps to a Shopify recurring charge. */
  billable: boolean;
  /** True when a merchant can self-serve subscribe (Custom is contact-only). */
  selfServe: boolean;
  blurb: string;
}

export const PLANS: Record<PlanKey, PlanDef> = {
  FREE: {
    key: "FREE",
    name: "Free",
    amount: 0,
    quota: 100,
    billable: false,
    selfServe: false,
    blurb: "100 try-ons every month. Free for early-access stores.",
  },
  BASIC: {
    key: "BASIC",
    name: "Basic",
    amount: 9.99,
    quota: 100,
    billable: true,
    selfServe: true,
    blurb: "100 try-ons every month.",
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    amount: 49.99,
    quota: 500,
    billable: true,
    selfServe: true,
    blurb: "500 try-ons every month.",
  },
  PLATINUM: {
    key: "PLATINUM",
    name: "Platinum",
    amount: 99.99,
    quota: 1000,
    billable: true,
    selfServe: true,
    blurb: "1,000 try-ons every month.",
  },
  CUSTOM: {
    key: "CUSTOM",
    name: "Custom",
    amount: 0,
    quota: Number.POSITIVE_INFINITY,
    billable: false,
    selfServe: false,
    blurb: "Higher volume, tailored to your store.",
  },
};

/** Order plans are shown in the UI. */
export const PLAN_ORDER: PlanKey[] = ["FREE", "BASIC", "PRO", "PLATINUM", "CUSTOM"];

/**
 * Billable plan ids — these strings are the keys of the `billing` config in
 * `shopify.server.ts` and the Shopify subscription names. Keep in sync.
 */
export const BILLABLE_PLAN_IDS = ["Basic", "Pro", "Platinum"] as const;
export type BillablePlanId = (typeof BILLABLE_PLAN_IDS)[number];

export function isBillablePlanId(value: string): value is BillablePlanId {
  return (BILLABLE_PLAN_IDS as readonly string[]).includes(value);
}

/** Map a Shopify subscription name (e.g. "Pro") back to our plan key. */
export function planKeyFromName(name: string | null | undefined): PlanKey | null {
  if (!name) return null;
  const match = PLAN_ORDER.map((k) => PLANS[k]).find((p) => p.name === name);
  return match ? match.key : null;
}

/** Normalise a stored plan value — maps legacy "BETA_FREE"/unknowns to FREE. */
export function normalizePlan(plan: string | null | undefined): PlanKey {
  if (plan && plan in PLANS) return plan as PlanKey;
  return "FREE";
}

/** Raw included quota for a plan key (ignores payment status). */
export function quotaFor(plan: string | null | undefined): number {
  return PLANS[normalizePlan(plan)].quota;
}

/**
 * The number of try-ons a shop is actually entitled to this month.
 *
 * Free and Custom are always entitled to their quota. A billable plan only
 * grants its quota while it has an active Shopify charge (`chargeId`); without
 * one it's a pending/lapsed subscription and gets 0 (a paywall).
 */
export function entitledQuota(
  plan: string | null | undefined,
  chargeId: string | null | undefined,
): number {
  const key = normalizePlan(plan);
  if (key === "FREE" || key === "CUSTOM") return PLANS[key].quota;
  return chargeId ? PLANS[key].quota : 0;
}
