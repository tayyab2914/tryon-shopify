import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { corsJson, corsPreflight } from "../lib/cors.server";
import { getWidgetConfig, normaliseShopDomain } from "../lib/shop.server";

// 60s CDN cache + 5min SWR — config rarely changes, the try-on endpoint
// enforces real gates so stale cosmetics are safe.
const CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return corsPreflight(request.headers.get("origin"));
  }
  return corsJson({ error: "Method not allowed" }, 405, request.headers.get("origin"));
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const origin = request.headers.get("origin");
  const shopDomain = normaliseShopDomain(params.shop);
  if (!shopDomain) {
    return corsJson({ error: "Invalid shop." }, 400, origin);
  }

  const shop = await getWidgetConfig(shopDomain);
  if (!shop) {
    return corsJson({ error: "Shop not installed." }, 404, origin);
  }

  return corsJson(
    {
      enabled: shop.widgetEnabled,
      buttonLabel: shop.buttonLabel,
      accentColor: shop.accentColor,
      consentText: shop.consentText,
      buttonPlacement: shop.buttonPlacement,
      buttonStyle: shop.buttonStyle,
      buttonRadius: shop.buttonRadius,
      buttonSize: shop.buttonSize,
      showOnProduct: shop.showOnProduct,
      showOnCollection: shop.showOnCollection,
      modalTitle: shop.modalTitle,
      addToCartLabel: shop.addToCartLabel,
    },
    200,
    origin,
    { "Cache-Control": CACHE_CONTROL },
  );
};
