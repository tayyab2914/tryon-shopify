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

  // Mark uninstalled and clear chargeId. We deliberately do NOT touch
  // widgetEnabled: the storefront endpoints (api.tryon, api.cart-add) already
  // gate on uninstalledAt, and uninstalling removes the theme app embed, so
  // serving stops regardless. Clearing widgetEnabled here used to leave the
  // widget OFF after a reinstall (reinstall clears uninstalledAt but never
  // restored it) — preserving it keeps the merchant's choice across reinstalls.
  // chargeId is cleared so a reinstall must request billing approval again
  // (App Store requirement 1.2.2).
  await db.shop.updateMany({
    where: { shopDomain: shop },
    data: { uninstalledAt: new Date(), chargeId: null },
  });

  return new Response();
};
