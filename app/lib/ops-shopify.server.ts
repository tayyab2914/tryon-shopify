import { unauthenticated } from "../shopify.server";

/**
 * Live reads from Shopify for the internal ops panel.
 *
 * Each store's offline access token (stored in the Session table at install)
 * lets us call the Admin API on its behalf WITHOUT a request session, via
 * `unauthenticated.admin(shopDomain)`. All calls are read-only GraphQL and are
 * individually try/caught: a single store being uninstalled, PCD-gated, or
 * unreachable returns `{ ok: false, reason }` and never breaks the whole page.
 */

export type LiveResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface ShopifySubscription {
  id: string;
  name: string;
  status: string; // ACTIVE | FROZEN | CANCELLED | EXPIRED | PENDING | DECLINED
  test: boolean;
  amount: number;
  currencyCode: string;
  interval: string | null;
  currentPeriodEnd: string | null;
  trialDays: number | null;
  createdAt: string | null;
}

export interface ShopifyBilling {
  /** The first active subscription, or null when the store has none. */
  subscription: ShopifySubscription | null;
}

export interface ShopifyProfile {
  name: string | null;
  contactEmail: string | null;
  email: string | null;
  domain: string | null;
  currencyCode: string | null;
  createdAt: string | null;
  country: string | null;
  shopifyPlan: string | null;
  devStore: boolean;
}

export interface ShopifyOrderCounts {
  total: number | null;
  last30d: number | null;
}

export interface ShopifySales {
  days: number;
  orderCount: number;
  totalSales: number;
  currency: string;
  /** True when the order list was capped before fully paginating. */
  capped: boolean;
}

async function adminFor(shopDomain: string) {
  // Throws if there's no offline session for the shop (e.g. uninstalled).
  const { admin } = await unauthenticated.admin(shopDomain);
  return admin;
}

function reasonFrom(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/no.*session|offline|token/i.test(msg)) return "no token (uninstalled?)";
  if (/access denied|not approved|protected customer|pcd/i.test(msg))
    return "orders not authorized (PCD)";
  return msg.slice(0, 140) || "shopify error";
}

const BILLING_QUERY = `#graphql
  query OpsBilling {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
        createdAt
        currentPeriodEnd
        trialDays
        lineItems {
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price { amount currencyCode }
                interval
              }
            }
          }
        }
      }
    }
  }`;

export async function getShopifyBilling(
  shopDomain: string,
): Promise<LiveResult<ShopifyBilling>> {
  try {
    const admin = await adminFor(shopDomain);
    const res = await admin.graphql(BILLING_QUERY);
    const body = (await res.json()) as {
      data?: {
        currentAppInstallation?: {
          activeSubscriptions?: Array<{
            id: string;
            name: string;
            status: string;
            test: boolean;
            createdAt?: string | null;
            currentPeriodEnd?: string | null;
            trialDays?: number | null;
            lineItems?: Array<{
              plan?: {
                pricingDetails?: {
                  price?: { amount?: string | number; currencyCode?: string };
                  interval?: string;
                };
              };
            }>;
          }>;
        };
      };
    };

    const subs = body.data?.currentAppInstallation?.activeSubscriptions ?? [];
    const sub = subs[0];
    if (!sub) return { ok: true, data: { subscription: null } };

    const pricing = sub.lineItems?.[0]?.plan?.pricingDetails;
    const amount = Number(pricing?.price?.amount ?? 0);

    return {
      ok: true,
      data: {
        subscription: {
          id: sub.id,
          name: sub.name,
          status: sub.status,
          test: Boolean(sub.test),
          amount: Number.isFinite(amount) ? amount : 0,
          currencyCode: pricing?.price?.currencyCode ?? "USD",
          interval: pricing?.interval ?? null,
          currentPeriodEnd: sub.currentPeriodEnd ?? null,
          trialDays: sub.trialDays ?? null,
          createdAt: sub.createdAt ?? null,
        },
      },
    };
  } catch (err) {
    return { ok: false, reason: reasonFrom(err) };
  }
}

const PROFILE_QUERY = `#graphql
  query OpsProfile {
    shop {
      name
      contactEmail
      email
      myshopifyDomain
      currencyCode
      createdAt
      billingAddress { country }
      plan { displayName partnerDevelopment }
    }
  }`;

export async function getShopifyProfile(
  shopDomain: string,
): Promise<LiveResult<ShopifyProfile>> {
  try {
    const admin = await adminFor(shopDomain);
    const res = await admin.graphql(PROFILE_QUERY);
    const body = (await res.json()) as {
      data?: {
        shop?: {
          name?: string | null;
          contactEmail?: string | null;
          email?: string | null;
          myshopifyDomain?: string | null;
          currencyCode?: string | null;
          createdAt?: string | null;
          billingAddress?: { country?: string | null } | null;
          plan?: { displayName?: string | null; partnerDevelopment?: boolean } | null;
        };
      };
    };
    const s = body.data?.shop;
    if (!s) return { ok: false, reason: "no shop data" };
    return {
      ok: true,
      data: {
        name: s.name ?? null,
        contactEmail: s.contactEmail ?? null,
        email: s.email ?? null,
        domain: s.myshopifyDomain ?? null,
        currencyCode: s.currencyCode ?? null,
        createdAt: s.createdAt ?? null,
        country: s.billingAddress?.country ?? null,
        shopifyPlan: s.plan?.displayName ?? null,
        devStore: Boolean(s.plan?.partnerDevelopment),
      },
    };
  } catch (err) {
    return { ok: false, reason: reasonFrom(err) };
  }
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

const ORDER_COUNTS_QUERY = `#graphql
  query OpsOrderCounts($recent: String!) {
    total: ordersCount(query: "") { count }
    recent: ordersCount(query: $recent) { count }
  }`;

/** Lightweight all-time + last-30-day order counts (used on the overview). */
export async function getShopifyOrderCounts(
  shopDomain: string,
): Promise<LiveResult<ShopifyOrderCounts>> {
  try {
    const admin = await adminFor(shopDomain);
    const res = await admin.graphql(ORDER_COUNTS_QUERY, {
      variables: { recent: `created_at:>=${daysAgoIso(30)}` },
    });
    const body = (await res.json()) as {
      data?: {
        total?: { count?: number | null } | null;
        recent?: { count?: number | null } | null;
      };
      errors?: unknown;
    };
    if (body.errors && !body.data) return { ok: false, reason: "orders query error" };
    return {
      ok: true,
      data: {
        total: body.data?.total?.count ?? null,
        last30d: body.data?.recent?.count ?? null,
      },
    };
  } catch (err) {
    return { ok: false, reason: reasonFrom(err) };
  }
}

const SALES_QUERY = `#graphql
  query OpsSales($query: String!, $after: String) {
    orders(first: 250, query: $query, after: $after) {
      edges {
        cursor
        node { totalPriceSet { shopMoney { amount currencyCode } } }
      }
      pageInfo { hasNextPage }
    }
  }`;

/**
 * Sum of order totals over the last `days`, paginated. Capped at 5 pages
 * (1,250 orders) so an unusually busy store can't hang the detail page; `capped`
 * flags when the window was truncated.
 */
export async function getShopifySales(
  shopDomain: string,
  days = 30,
): Promise<LiveResult<ShopifySales>> {
  try {
    const admin = await adminFor(shopDomain);
    const query = `created_at:>=${daysAgoIso(days)}`;
    let after: string | null = null;
    let orderCount = 0;
    let totalSales = 0;
    let currency = "USD";
    let capped = false;

    for (let page = 0; page < 5; page++) {
      const res = await admin.graphql(SALES_QUERY, {
        variables: { query, after },
      });
      const body = (await res.json()) as {
        data?: {
          orders?: {
            edges?: Array<{
              cursor: string;
              node?: {
                totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
              };
            }>;
            pageInfo?: { hasNextPage?: boolean };
          };
        };
        errors?: unknown;
      };
      const orders = body.data?.orders;
      if (!orders) {
        if (body.errors) return { ok: false, reason: "orders query error (PCD?)" };
        break;
      }
      const edges = orders.edges ?? [];
      for (const e of edges) {
        orderCount++;
        const money = e.node?.totalPriceSet?.shopMoney;
        const amt = parseFloat(money?.amount ?? "0");
        if (Number.isFinite(amt)) totalSales += amt;
        if (money?.currencyCode) currency = money.currencyCode;
      }
      if (!orders.pageInfo?.hasNextPage) {
        after = null;
        break;
      }
      after = edges[edges.length - 1]?.cursor ?? null;
      if (page === 4) capped = true;
    }

    return {
      ok: true,
      data: {
        days,
        orderCount,
        totalSales: Math.round(totalSales * 100) / 100,
        currency,
        capped,
      },
    };
  } catch (err) {
    return { ok: false, reason: reasonFrom(err) };
  }
}

/** Run `fn` over `items` with a bounded concurrency (default 5). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
