import db from "../db.server";
import {
  monthStart,
  syncShopPlan,
  getPlanStatus,
  type PlanStatus,
} from "./billing.server";
import { getAnalytics, type Analytics } from "./tryon.server";
import { normalizePlan, PLANS, quotaFor, isBillablePlanId } from "./plans";
import {
  getShopifyBilling,
  getShopifyProfile,
  getShopifyOrderCounts,
  getShopifySales,
  mapLimit,
  type ShopifySubscription,
  type ShopifyProfile,
  type ShopifySales,
} from "./ops-shopify.server";

/**
 * Orchestration for the internal ops panel: combine each store's LIVE Shopify
 * data (subscription, profile, orders) with the app's own local analytics, and
 * reconcile the DB to Shopify along the way.
 */

export type StoreState = "ACTIVE" | "IDLE" | "UNINSTALLED";
export type PaymentStatus = "PAID" | "UNPAID" | "FREE" | "CUSTOM" | "UNINSTALLED";
export type SyncState = "synced" | "stale" | "skipped";

export interface OverviewRow {
  shopId: string;
  shopDomain: string;
  storeName: string | null;
  contactEmail: string | null;
  country: string | null;
  shopifyPlan: string | null;
  state: StoreState;
  payment: PaymentStatus;
  /** Raw Shopify subscription status when there is one (ACTIVE/FROZEN/…). */
  subscriptionStatus: string | null;
  planName: string;
  priceAmount: number;
  priceCurrency: string;
  isTest: boolean;
  usedThisMonth: number;
  quota: number | null; // null = unlimited
  overQuota: boolean;
  lifetimeTryOns: number;
  lifetimeCartAdds: number;
  lifetimeOrders: number;
  orders30d: number | null; // live from Shopify
  installedAt: string;
  uninstalledAt: string | null;
  lastActivityAt: string | null;
  syncState: SyncState;
  syncReason: string | null;
}

export interface OverviewKpis {
  totalStores: number;
  activeInstalls: number;
  paid: number;
  unpaid: number;
  free: number;
  custom: number;
  uninstalled: number;
  idle: number;
  mrr: number; // sum of live subscription prices, excluding test subs
  mrrCurrency: string;
  /** True when paid subs span >1 currency, so `mrr` is only the dominant one. */
  mrrMixedCurrency: boolean;
  tryOnsThisMonth: number;
  lifetimeTryOns: number;
  lifetimeCartAdds: number;
  lifetimeOrders: number;
  orders30dLive: number;
  /** Installed stores whose live 30-day order count couldn't be read (PCD/unreachable). */
  orders30dMissing: number;
  localRevenue: number;
  localRevenueCurrency: string;
  /** True when tracked orders span >1 currency, so `localRevenue` is only the dominant one. */
  localRevenueMixedCurrency: boolean;
  /** How many stores' live Shopify read failed (shown as a warning). */
  syncFailures: number;
}

export interface OverviewData {
  kpis: OverviewKpis;
  rows: OverviewRow[];
  generatedAt: string;
}

interface Contact {
  email: string | null;
  name: string | null;
}

/** Pick the best contact (account owner first) per shop domain from Session rows. */
function contactsByShop(
  sessions: Array<{
    shop: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    accountOwner: boolean;
  }>,
): Map<string, Contact> {
  const map = new Map<string, Contact>();
  for (const s of sessions) {
    const existing = map.get(s.shop);
    const name = [s.firstName, s.lastName].filter(Boolean).join(" ") || null;
    // Prefer a row that is the account owner and/or has an email.
    if (!existing || (s.accountOwner && s.email) || (!existing.email && s.email)) {
      map.set(s.shop, { email: s.email ?? existing?.email ?? null, name: name ?? existing?.name ?? null });
    }
  }
  return map;
}

function toId<T extends { shopId: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.shopId, r]));
}

/**
 * Determine payment status from the live Shopify subscription (source of truth),
 * falling back to the DB plan/chargeId when the live read failed.
 */
function derivePayment(
  planKey: ReturnType<typeof normalizePlan>,
  chargeId: string | null,
  sub: ShopifySubscription | null,
  liveOk: boolean,
): { payment: PaymentStatus; subscriptionStatus: string | null } {
  if (liveOk) {
    if (sub && sub.status === "ACTIVE") return { payment: "PAID", subscriptionStatus: sub.status };
    if (sub) return { payment: "UNPAID", subscriptionStatus: sub.status }; // FROZEN/PENDING/…
    if (planKey === "FREE") return { payment: "FREE", subscriptionStatus: null };
    if (planKey === "CUSTOM") return { payment: "CUSTOM", subscriptionStatus: null };
    return { payment: "UNPAID", subscriptionStatus: null }; // billable, no active sub
  }
  // Live read failed — fall back to last-known DB state.
  if (planKey === "FREE") return { payment: "FREE", subscriptionStatus: null };
  if (planKey === "CUSTOM") return { payment: "CUSTOM", subscriptionStatus: null };
  if (isBillablePlanId(PLANS[planKey].name) && chargeId) return { payment: "PAID", subscriptionStatus: null };
  return { payment: "UNPAID", subscriptionStatus: null };
}

export async function getOpsOverview(): Promise<OverviewData> {
  const [shops, sessions, monthly, lifetimeTryOn, lifetimeCart, lifetimeOrder, orderTotals] =
    await Promise.all([
      db.shop.findMany({ orderBy: { installedAt: "desc" } }),
      db.session.findMany({
        select: { shop: true, email: true, firstName: true, lastName: true, accountOwner: true },
      }),
      db.tryOn.groupBy({
        by: ["shopId"],
        where: { status: "COMPLETED", createdAt: { gte: monthStart() } },
        _count: { _all: true },
      }),
      db.tryOn.groupBy({ by: ["shopId"], _count: { _all: true }, _max: { createdAt: true } }),
      db.cartAdd.groupBy({ by: ["shopId"], _count: { _all: true } }),
      db.orderEvent.groupBy({ by: ["shopId"], _count: { _all: true } }),
      db.orderEvent.findMany({ select: { totalPrice: true, currency: true } }),
    ]);

  const contacts = contactsByShop(sessions);
  const monthlyMap = new Map(monthly.map((m) => [m.shopId, m._count._all]));
  const tryOnMap = toId(lifetimeTryOn);
  const cartMap = new Map(lifetimeCart.map((c) => [c.shopId, c._count._all]));
  const orderMap = new Map(lifetimeOrder.map((o) => [o.shopId, o._count._all]));

  // Live Shopify reads (only for installed stores), bounded concurrency.
  const installed = shops.filter((s) => !s.uninstalledAt);
  const live = new Map<
    string,
    {
      sub: ShopifySubscription | null;
      profile: ShopifyProfile | null;
      orders30d: number | null;
      ok: boolean;
      reason: string | null;
    }
  >();

  await mapLimit(installed, 5, async (shop) => {
    const [billing, profile, counts] = await Promise.all([
      getShopifyBilling(shop.shopDomain),
      getShopifyProfile(shop.shopDomain),
      getShopifyOrderCounts(shop.shopDomain),
    ]);
    const ok = billing.ok;
    live.set(shop.id, {
      sub: billing.ok ? billing.data.subscription : null,
      profile: profile.ok ? profile.data : null,
      orders30d: counts.ok ? counts.data.last30d : null,
      ok,
      reason: billing.ok ? null : billing.reason,
    });

    // Reconcile the DB to Shopify (only when we actually reached billing).
    if (billing.ok) {
      const active = billing.data.subscription && billing.data.subscription.status === "ACTIVE"
        ? { id: billing.data.subscription.id, name: billing.data.subscription.name }
        : null;
      try {
        await syncShopPlan(shop.shopDomain, active);
      } catch {
        // Reconciliation is best-effort; never fail the page over it.
      }
    }
  });

  const rows: OverviewRow[] = shops.map((shop) => {
    const l = live.get(shop.id);
    const isUninstalled = Boolean(shop.uninstalledAt);
    const lifetimeTryOns = tryOnMap.get(shop.id)?._count._all ?? 0;
    const lastActivityAt = tryOnMap.get(shop.id)?._max.createdAt ?? null;

    // syncShopPlan may have updated the row; re-read the relevant fields from
    // Shopify's subscription where present, else the DB value we loaded.
    const sub = l?.sub ?? null;
    const liveOk = Boolean(l?.ok);
    const planKey = sub && sub.status === "ACTIVE"
      ? (normalizePlan(planKeyName(sub.name)))
      : normalizePlan(shop.plan);
    const { payment, subscriptionStatus } = derivePayment(
      normalizePlan(shop.plan),
      shop.chargeId,
      sub,
      liveOk,
    );

    const state: StoreState = isUninstalled
      ? "UNINSTALLED"
      : lifetimeTryOns > 0
        ? "ACTIVE"
        : "IDLE";

    const q = quotaFor(planKey);
    const quota = Number.isFinite(q) ? q : null;
    const usedThisMonth = monthlyMap.get(shop.id) ?? 0;

    const contact = contacts.get(shop.shopDomain);
    const priceAmount = payment === "PAID" && sub ? sub.amount : PLANS[planKey].amount;
    const priceCurrency = sub?.currencyCode ?? "USD";

    const syncState: SyncState = isUninstalled ? "skipped" : liveOk ? "synced" : "stale";

    return {
      shopId: shop.id,
      shopDomain: shop.shopDomain,
      storeName: l?.profile?.name ?? null,
      contactEmail: l?.profile?.contactEmail ?? l?.profile?.email ?? contact?.email ?? null,
      country: l?.profile?.country ?? null,
      shopifyPlan: l?.profile?.shopifyPlan ?? null,
      state,
      payment,
      subscriptionStatus,
      planName: payment === "PAID" && sub ? sub.name : PLANS[planKey].name,
      priceAmount,
      priceCurrency,
      isTest: Boolean(sub?.test),
      usedThisMonth,
      quota,
      overQuota: quota != null && usedThisMonth >= quota,
      lifetimeTryOns,
      lifetimeCartAdds: cartMap.get(shop.id) ?? 0,
      lifetimeOrders: orderMap.get(shop.id) ?? 0,
      orders30d: l?.orders30d ?? null,
      installedAt: shop.installedAt.toISOString(),
      uninstalledAt: shop.uninstalledAt ? shop.uninstalledAt.toISOString() : null,
      lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null,
      syncState,
      syncReason: l?.reason ?? null,
    };
  });

  // Revenue we tracked ourselves (order webhooks), grouped by the currency each
  // order was actually placed in. Summing across currencies would produce a
  // meaningless figure, so we report the total in the dominant currency and flag
  // when others exist rather than silently mixing (or inventing an FX rate).
  const revByCurrency = new Map<string, number>();
  for (const o of orderTotals) {
    const v = parseFloat(o.totalPrice);
    if (!Number.isFinite(v)) continue;
    const cur = o.currency || "USD";
    revByCurrency.set(cur, (revByCurrency.get(cur) ?? 0) + v);
  }
  const revenueAgg = dominantCurrency(revByCurrency);

  // MRR = live subscription prices of paid, non-test stores, in the currency
  // Shopify actually bills them in (not an assumed "USD").
  const mrrByCurrency = new Map<string, number>();
  for (const r of rows) {
    if (r.payment !== "PAID" || r.isTest) continue;
    mrrByCurrency.set(r.priceCurrency, (mrrByCurrency.get(r.priceCurrency) ?? 0) + r.priceAmount);
  }
  const mrrAgg = dominantCurrency(mrrByCurrency);

  const kpis: OverviewKpis = {
    totalStores: rows.length,
    activeInstalls: rows.filter((r) => r.state !== "UNINSTALLED").length,
    paid: rows.filter((r) => r.payment === "PAID").length,
    unpaid: rows.filter((r) => r.payment === "UNPAID").length,
    free: rows.filter((r) => r.payment === "FREE").length,
    custom: rows.filter((r) => r.payment === "CUSTOM").length,
    uninstalled: rows.filter((r) => r.state === "UNINSTALLED").length,
    idle: rows.filter((r) => r.state === "IDLE").length,
    mrr: mrrAgg.amount,
    mrrCurrency: mrrAgg.currency,
    mrrMixedCurrency: mrrAgg.mixed,
    tryOnsThisMonth: [...monthlyMap.values()].reduce((a, b) => a + b, 0),
    lifetimeTryOns: rows.reduce((a, r) => a + r.lifetimeTryOns, 0),
    lifetimeCartAdds: rows.reduce((a, r) => a + r.lifetimeCartAdds, 0),
    lifetimeOrders: rows.reduce((a, r) => a + r.lifetimeOrders, 0),
    orders30dLive: rows.reduce((a, r) => a + (r.orders30d ?? 0), 0),
    orders30dMissing: rows.filter((r) => r.state !== "UNINSTALLED" && r.orders30d == null).length,
    localRevenue: revenueAgg.amount,
    localRevenueCurrency: revenueAgg.currency,
    localRevenueMixedCurrency: revenueAgg.mixed,
    syncFailures: rows.filter((r) => r.syncState === "stale").length,
  };

  return { kpis, rows, generatedAt: new Date().toISOString() };
}

/**
 * Reduce a currency→amount map to a single reported figure: the total of the
 * currency with the largest sum, plus a `mixed` flag when other currencies are
 * present (so the UI can say so instead of implying the number covers them).
 */
function dominantCurrency(byCurrency: Map<string, number>): {
  amount: number;
  currency: string;
  mixed: boolean;
} {
  if (byCurrency.size === 0) return { amount: 0, currency: "USD", mixed: false };
  const sorted = [...byCurrency.entries()].sort((a, b) => b[1] - a[1]);
  const [currency, amount] = sorted[0];
  return { amount: Math.round(amount * 100) / 100, currency, mixed: sorted.length > 1 };
}

/** Map a Shopify subscription name ("Basic"/"Pro"/…) to our plan key string. */
function planKeyName(name: string): string {
  const match = Object.values(PLANS).find((p) => p.name === name);
  return match ? match.key : "FREE";
}

// ─── Store detail ────────────────────────────────────────────────────────────

export interface OpsShopDetail {
  shopId: string;
  shopDomain: string;
  installedAt: string;
  uninstalledAt: string | null;
  widgetEnabled: boolean;
  pixelActivated: boolean;
  trialEndsAt: string | null;
  tryOnLimitEnabled: boolean;
  tryOnLimitPerIp: number;
  tryOnLimitPeriod: string;
  // Live Shopify
  profile: ShopifyProfile | null;
  profileReason: string | null;
  subscription: ShopifySubscription | null;
  billingReason: string | null;
  sales: ShopifySales | null;
  salesReason: string | null;
  payment: PaymentStatus;
  // Local
  planStatus: PlanStatus;
  analytics: Analytics;
  contact: Contact | null;
  recentTryOns: Array<{
    id: string;
    garment: string | null;
    productHandle: string | null;
    status: string;
    createdAt: string;
  }>;
}

export async function getOpsShopDetail(
  shopId: string,
  periodDays: number,
): Promise<OpsShopDetail | null> {
  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) return null;

  const isUninstalled = Boolean(shop.uninstalledAt);

  const [billing, profile, sales, analytics, recent, sessions] = await Promise.all([
    isUninstalled ? Promise.resolve(null) : getShopifyBilling(shop.shopDomain),
    isUninstalled ? Promise.resolve(null) : getShopifyProfile(shop.shopDomain),
    isUninstalled ? Promise.resolve(null) : getShopifySales(shop.shopDomain, periodDays),
    getAnalytics(shop.id, periodDays),
    db.tryOn.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, garment: true, productHandle: true, status: true, createdAt: true },
    }),
    db.session.findMany({
      where: { shop: shop.shopDomain },
      select: { shop: true, email: true, firstName: true, lastName: true, accountOwner: true },
    }),
  ]);

  // Reconcile DB to Shopify when live billing succeeded.
  if (billing && billing.ok) {
    const active =
      billing.data.subscription && billing.data.subscription.status === "ACTIVE"
        ? { id: billing.data.subscription.id, name: billing.data.subscription.name }
        : null;
    try {
      await syncShopPlan(shop.shopDomain, active);
    } catch {
      /* best-effort */
    }
  }

  const fresh = await db.shop.findUnique({
    where: { id: shopId },
    select: { plan: true, chargeId: true },
  });
  const planStatus = await getPlanStatus(shop.id, fresh?.plan, fresh?.chargeId);

  const sub = billing && billing.ok ? billing.data.subscription : null;
  const liveOk = Boolean(billing && billing.ok);
  const { payment } = derivePayment(
    normalizePlan(fresh?.plan),
    fresh?.chargeId ?? null,
    sub,
    liveOk,
  );

  const contact = contactsByShop(sessions).get(shop.shopDomain) ?? null;

  return {
    shopId: shop.id,
    shopDomain: shop.shopDomain,
    installedAt: shop.installedAt.toISOString(),
    uninstalledAt: shop.uninstalledAt ? shop.uninstalledAt.toISOString() : null,
    widgetEnabled: shop.widgetEnabled,
    pixelActivated: shop.pixelActivated,
    trialEndsAt: shop.trialEndsAt ? shop.trialEndsAt.toISOString() : null,
    tryOnLimitEnabled: shop.tryOnLimitEnabled,
    tryOnLimitPerIp: shop.tryOnLimitPerIp,
    tryOnLimitPeriod: shop.tryOnLimitPeriod,
    profile: profile && profile.ok ? profile.data : null,
    profileReason: profile && !profile.ok ? profile.reason : null,
    subscription: sub,
    billingReason: billing && !billing.ok ? billing.reason : isUninstalled ? "uninstalled" : null,
    sales: sales && sales.ok ? sales.data : null,
    salesReason: sales && !sales.ok ? sales.reason : isUninstalled ? "uninstalled" : null,
    payment: isUninstalled ? "UNINSTALLED" : payment,
    planStatus,
    analytics,
    contact,
    recentTryOns: recent.map((t) => ({
      id: t.id,
      garment: t.garment,
      productHandle: t.productHandle,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}
