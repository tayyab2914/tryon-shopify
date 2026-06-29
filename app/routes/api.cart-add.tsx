import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { corsJson, corsPreflight } from "../lib/cors.server";
import { getShopByDomain, normaliseShopDomain } from "../lib/shop.server";

/**
 * Remix routes non-mutation methods (incl. OPTIONS) to the loader, so the CORS
 * preflight must be answered here — not only in the action — or the browser
 * blocks the cross-origin cart-add POST and conversions go unrecorded.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return corsPreflight(origin);
  return corsJson({ success: false, error: "Method not allowed" }, 405, origin);
};

/**
 * Storefront-facing endpoint the widget POSTs to after it successfully adds
 * an item to the Shopify cart. Fire-and-forget on the client side; this
 * route never affects the cart itself — it just logs the conversion event.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return corsPreflight(origin);
  if (request.method !== "POST") {
    return corsJson({ success: false, error: "Method not allowed" }, 405, origin);
  }

  let body: {
    shop?: string;
    tryOnId?: string | null;
    productId?: string;
    variantId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return corsJson({ success: false, error: "Invalid JSON body." }, 400, origin);
  }

  const shopDomain = normaliseShopDomain(body.shop);
  const productId = (body.productId ?? "").toString().trim();
  if (!shopDomain || !productId) {
    return corsJson({ success: false, error: "Missing shop or productId." }, 400, origin);
  }

  const shop = await getShopByDomain(shopDomain);
  if (!shop || shop.uninstalledAt) {
    return corsJson({ success: false, error: "Unknown shop." }, 404, origin);
  }

  // Only link the try-on if it actually belongs to this shop — protects
  // against a spoofed `tryOnId` from another store's session.
  let tryOnId: string | null = null;
  if (body.tryOnId) {
    const tryOn = await db.tryOn.findFirst({
      where: { id: body.tryOnId, shopId: shop.id },
      select: { id: true },
    });
    tryOnId = tryOn?.id ?? null;
  }

  await db.cartAdd.create({
    data: {
      shopId: shop.id,
      tryOnId,
      productId,
      variantId: body.variantId?.toString().trim() || null,
    },
  });

  return corsJson({ success: true }, 200, origin);
};
