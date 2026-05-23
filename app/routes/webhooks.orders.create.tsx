import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * orders/create — aggregate-only conversion tracking.
 * We record one row per order so the analytics page can show
 * "try-ons / cart adds / orders" trends side by side. No per-order
 * attribution to a try-on (the cart-add log already does that loosely).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[webhook] ${topic} for ${shop}`);

  const order = payload as {
    id?: number | string;
    total_price?: string;
    currency?: string;
    line_items?: Array<{ quantity?: number; product_id?: number | string }>;
  };
  if (!order.id) return new Response();

  const shopRow = await db.shop.findUnique({
    where: { shopDomain: shop },
    select: { id: true },
  });
  if (!shopRow) return new Response();

  const lineItems = order.line_items ?? [];
  const itemCount = lineItems.reduce((sum, li) => sum + (li.quantity ?? 0), 0);

  // Attribution: was any purchased product tried on via the widget recently?
  // Product ids only — no customer PII is read from the order.
  const productIds = lineItems
    .map((li) => (li.product_id != null ? String(li.product_id) : null))
    .filter((id): id is string => Boolean(id));

  let attributed = false;
  if (productIds.length) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const match = await db.tryOn.findFirst({
      where: {
        shopId: shopRow.id,
        productId: { in: productIds },
        status: "COMPLETED",
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    attributed = Boolean(match);
  }

  // Re-deliveries can fire the same webhook twice — `shopifyOrderId` is unique.
  try {
    await db.orderEvent.create({
      data: {
        shopId: shopRow.id,
        shopifyOrderId: String(order.id),
        totalPrice: order.total_price ?? "0",
        currency: order.currency ?? "USD",
        itemCount,
        attributed,
      },
    });
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("Unique")) {
      throw err;
    }
  }

  return new Response();
};
