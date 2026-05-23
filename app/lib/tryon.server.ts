import db from "../db.server";
import { runTryOn as generateTryOn } from "./gemini.server";

export interface ImageInput {
  data: Buffer;
  mimeType: string;
}

export interface RunTryOnInput {
  shopId: string;
  productId?: string;
  productHandle?: string;
  productUrl?: string;
  productLabel?: string;
  ipHash?: string | null;
  personImage: ImageInput;
  garmentImage: ImageInput;
}

export interface RunTryOnResult {
  tryOnId: string;
  image: ImageInput;
}

/**
 * Runs one virtual try-on through the Gemini engine.
 *
 * Privacy: no image — uploaded or generated — is ever persisted. Only a
 * lightweight, image-free event row is written so merchants can see try-on
 * volume in their dashboard.
 */
export async function runTryOn(input: RunTryOnInput): Promise<RunTryOnResult> {
  const startedAt = Date.now();
  try {
    const result = await generateTryOn({
      personBase64: input.personImage.data.toString("base64"),
      personMimeType: input.personImage.mimeType,
      garmentBase64: input.garmentImage.data.toString("base64"),
      garmentMimeType: input.garmentImage.mimeType,
    });
    const tryOn = await logEvent(input, "COMPLETED", null, Date.now() - startedAt);
    return {
      tryOnId: tryOn?.id ?? "",
      image: {
        data: Buffer.from(result.imageBase64, "base64"),
        mimeType: result.mimeType,
      },
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 200) : "error";
    await logEvent(input, "FAILED", detail, Date.now() - startedAt);
    throw err;
  }
}

async function logEvent(
  input: RunTryOnInput,
  status: "COMPLETED" | "FAILED",
  error: string | null,
  durationMs: number,
): Promise<{ id: string } | null> {
  try {
    return await db.tryOn.create({
      data: {
        shopId: input.shopId,
        productId: input.productId ?? null,
        productHandle: input.productHandle ?? null,
        productUrl: input.productUrl ?? null,
        garment: input.productLabel?.trim() || "Virtual try-on",
        status,
        error,
        ipHash: input.ipHash ?? "",
        durationMs,
      },
      select: { id: true },
    });
  } catch (err) {
    console.error("try-on event log failed", err);
    return null;
  }
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface DailyPoint {
  date: string;
  label: string;
  tryOns: number;
  cartAdds: number;
  orders: number;
}

export interface ProductCount {
  label: string;
  count: number;
}

export interface Analytics {
  periodDays: number;
  tryOnTotal: number;
  cartAddTotal: number;
  orderTotal: number;
  /** Orders containing a product that was tried on via the widget. */
  attributedOrderTotal: number;
  /** Sum of order totals in the window. */
  revenue: number;
  /** Currency code of the orders (most recent), for display. */
  currency: string;
  completed: number;
  failed: number;
  successRate: number;
  /** Cart adds / completed try-ons, as a 0-100 percentage. */
  conversionRate: number;
  /** Orders / cart adds, as a 0-100 percentage. */
  orderConversionRate: number;
  daily: DailyPoint[];
  topProducts: ProductCount[];
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Aggregate try-on / cart-add / order activity for a shop over the last
 * `periodDays` days. Three queries; bucketing happens in memory.
 */
export async function getAnalytics(
  shopId: string,
  periodDays: number,
): Promise<Analytics> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (periodDays - 1));

  const [tryOns, cartAdds, orders] = await Promise.all([
    db.tryOn.findMany({
      where: { shopId, createdAt: { gte: since } },
      select: { createdAt: true, status: true, garment: true },
    }),
    db.cartAdd.findMany({
      where: { shopId, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    db.orderEvent.findMany({
      where: { shopId, createdAt: { gte: since } },
      select: { createdAt: true, totalPrice: true, currency: true, attributed: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const seedBuckets = () => {
    const m = new Map<string, number>();
    for (let i = 0; i < periodDays; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      m.set(utcDateKey(d), 0);
    }
    return m;
  };

  const tryOnBuckets = seedBuckets();
  const cartBuckets = seedBuckets();
  const orderBuckets = seedBuckets();

  let completed = 0;
  let failed = 0;
  const products = new Map<string, number>();

  for (const row of tryOns) {
    const key = utcDateKey(row.createdAt);
    if (tryOnBuckets.has(key)) tryOnBuckets.set(key, (tryOnBuckets.get(key) ?? 0) + 1);
    if (row.status === "COMPLETED") completed++;
    else if (row.status === "FAILED") failed++;
    const g = row.garment ?? "Virtual try-on";
    products.set(g, (products.get(g) ?? 0) + 1);
  }
  for (const row of cartAdds) {
    const key = utcDateKey(row.createdAt);
    if (cartBuckets.has(key)) cartBuckets.set(key, (cartBuckets.get(key) ?? 0) + 1);
  }
  for (const row of orders) {
    const key = utcDateKey(row.createdAt);
    if (orderBuckets.has(key)) orderBuckets.set(key, (orderBuckets.get(key) ?? 0) + 1);
  }

  const daily: DailyPoint[] = [...tryOnBuckets.entries()].map(([date]) => ({
    date,
    label: new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
    tryOns: tryOnBuckets.get(date) ?? 0,
    cartAdds: cartBuckets.get(date) ?? 0,
    orders: orderBuckets.get(date) ?? 0,
  }));

  const finished = completed + failed;
  const topProducts: ProductCount[] = [...products.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const revenue = orders.reduce((sum, o) => {
    const v = parseFloat(o.totalPrice);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
  const attributedOrderTotal = orders.reduce((n, o) => n + (o.attributed ? 1 : 0), 0);
  const currency = orders[0]?.currency ?? "USD";

  return {
    periodDays,
    tryOnTotal: tryOns.length,
    cartAddTotal: cartAdds.length,
    orderTotal: orders.length,
    attributedOrderTotal,
    revenue: Math.round(revenue * 100) / 100,
    currency,
    completed,
    failed,
    successRate: finished ? Math.round((completed / finished) * 100) : 0,
    conversionRate: completed ? Math.round((cartAdds.length / completed) * 100) : 0,
    orderConversionRate: cartAdds.length ? Math.round((orders.length / cartAdds.length) * 100) : 0,
    daily,
    topProducts,
  };
}
