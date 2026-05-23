import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * GDPR — shop/redact.
 * Fires 48 hours after the merchant uninstalls our app. Hard-deletes the
 * Shop row; Prisma cascades into TryOn, CartAdd, OrderEvent. Sessions are
 * already gone (cleared by webhooks.app.uninstalled).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`[webhook][GDPR] ${topic} for ${shop} — purging all data`);

  await db.shop.deleteMany({ where: { shopDomain: shop } });
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
