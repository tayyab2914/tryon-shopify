import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { syncShopPlan } from "../lib/billing.server";

/**
 * app_subscriptions/update — fires whenever a merchant's app subscription
 * changes (approved, cancelled, frozen, expired). We reconcile `Shop.plan` /
 * `chargeId` so the storefront quota gate, which trusts the DB, stays accurate
 * even when the change happens outside our Billing page.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[webhook] ${topic} for ${shop}`);

  const sub = (payload as { app_subscription?: { admin_graphql_api_id?: string; name?: string; status?: string } })
    .app_subscription;

  if (sub?.status === "ACTIVE" && sub.name) {
    await syncShopPlan(shop, { id: sub.admin_graphql_api_id ?? "", name: sub.name });
  } else {
    // CANCELLED / FROZEN / EXPIRED / PENDING / DECLINED — no active entitlement.
    await syncShopPlan(shop, null);
  }

  return new Response();
};
