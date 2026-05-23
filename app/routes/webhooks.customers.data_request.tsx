import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * GDPR — customers/data_request.
 * We do not store any customer PII (uploaded photos are processed in-memory
 * and discarded; only an `ipHash` is kept). Acknowledge the request and log
 * it for audit; nothing to export.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[webhook][GDPR] ${topic} for ${shop}`, JSON.stringify(payload));
  return new Response();
};
