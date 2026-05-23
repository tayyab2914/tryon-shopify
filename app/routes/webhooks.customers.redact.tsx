import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * GDPR — customers/redact.
 * No-op for us: we don't store customer-identifiable data. TryOn events
 * carry a salted `ipHash`, which is not personally identifiable.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[webhook][GDPR] ${topic} for ${shop}`, JSON.stringify(payload));
  return new Response();
};
