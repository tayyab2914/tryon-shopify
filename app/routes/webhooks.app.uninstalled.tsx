import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * App uninstalled — clear OAuth sessions and mark the Shop row as
 * uninstalled so the storefront widget stops serving from it. We keep the
 * historical TryOn/CartAdd/OrderEvent rows so reinstalls don't lose stats.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`[webhook] ${topic} for ${shop}`);

  // Webhooks can fire multiple times — guard against missing session.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  await db.shop.updateMany({
    where: { shopDomain: shop },
    data: { uninstalledAt: new Date(), widgetEnabled: false },
  });

  return new Response();
};
