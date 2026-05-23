import type { ActionFunctionArgs } from "@remix-run/node";
import { corsJson, corsPreflight } from "../lib/cors.server";
import { getShopByDomain, normaliseShopDomain } from "../lib/shop.server";
import { runTryOn, type ImageInput } from "../lib/tryon.server";
import {
  checkIpLimit,
  ipHashFromHeaders,
  periodLabel,
  type LimitPeriod,
} from "../lib/rate-limit.server";
import { monthlyUsage } from "../lib/billing.server";
import { entitledQuota } from "../lib/plans";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const action = async ({ request }: ActionFunctionArgs) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return corsPreflight(origin);
  if (request.method !== "POST") {
    return corsJson({ success: false, error: "Method not allowed" }, 405, origin);
  }

  try {
    const form = await request.formData();
    const shopDomain = normaliseShopDomain(String(form.get("shop") ?? ""));
    const productId = String(form.get("productId") ?? "").trim() || undefined;
    const productHandle = String(form.get("productHandle") ?? "").trim() || undefined;
    const productLabel = String(form.get("productLabel") ?? "").trim() || undefined;
    const garmentUrl = String(form.get("garmentImageUrl") ?? "").trim();
    const photo = form.get("photo");

    if (!shopDomain) {
      return corsJson(
        { success: false, error: "This store is not set up for virtual try-on." },
        403,
        origin,
      );
    }

    const shop = await getShopByDomain(shopDomain);
    if (!shop || shop.uninstalledAt) {
      return corsJson(
        { success: false, error: "This store is not set up for virtual try-on." },
        403,
        origin,
      );
    }
    if (!shop.widgetEnabled) {
      return corsJson(
        { success: false, error: "Virtual try-on is turned off for this store." },
        403,
        origin,
      );
    }

    // Plan quota — caps how many try-ons the store can serve per month based on
    // its subscription. A neutral, shopper-facing message (no billing details).
    const quota = entitledQuota(shop.plan, shop.chargeId);
    if (Number.isFinite(quota)) {
      const usedThisMonth = await monthlyUsage(shop.id);
      if (usedThisMonth >= quota) {
        return corsJson(
          {
            success: false,
            error: "Virtual try-on is temporarily unavailable for this store. Please check back later.",
            code: "QUOTA_EXCEEDED",
          },
          429,
          origin,
        );
      }
    }

    // Per-IP rate limit — caps how many try-ons one shopper can run.
    const ipHash = ipHashFromHeaders(request.headers);
    const limit = await checkIpLimit(shop.id, ipHash, {
      enabled: shop.tryOnLimitEnabled,
      perIp: shop.tryOnLimitPerIp,
      period: shop.tryOnLimitPeriod as LimitPeriod,
    });
    if (!limit.allowed) {
      return corsJson(
        {
          success: false,
          error: `You've reached the try-on limit for this store (${limit.limit} per visitor ${periodLabel(limit.period)}). Please try again later.`,
          code: "RATE_LIMITED",
        },
        429,
        origin,
      );
    }

    if (!(photo instanceof File) || photo.size === 0) {
      return corsJson({ success: false, error: "Please choose a photo to try on." }, 400, origin);
    }
    if (photo.size > MAX_IMAGE_BYTES) {
      return corsJson({ success: false, error: "That photo is too large (max 12 MB)." }, 400, origin);
    }
    if (!ALLOWED_TYPES.includes(photo.type)) {
      return corsJson(
        { success: false, error: "Please upload a JPEG, PNG, or WebP image." },
        400,
        origin,
      );
    }

    if (!/^https?:\/\//i.test(garmentUrl)) {
      return corsJson({ success: false, error: "This product is missing its image." }, 400, origin);
    }
    const garmentImage = await fetchGarment(garmentUrl);
    if (!garmentImage) {
      return corsJson(
        { success: false, error: "We couldn't load this product's image. Please try again." },
        400,
        origin,
      );
    }

    const personImage: ImageInput = {
      data: Buffer.from(await photo.arrayBuffer()),
      mimeType: photo.type,
    };

    const { tryOnId, image } = await runTryOn({
      shopId: shop.id,
      productId,
      productHandle,
      productUrl: garmentUrl,
      productLabel,
      ipHash,
      personImage,
      garmentImage,
    });

    return corsJson(
      {
        success: true,
        tryOnId,
        resultImage: `data:${image.mimeType};base64,${image.data.toString("base64")}`,
      },
      200,
      origin,
    );
  } catch (err) {
    console.error("storefront try-on failed", err);
    return corsJson(
      {
        success: false,
        error: "Something went wrong generating your try-on. Please try a different photo.",
      },
      500,
      origin,
    );
  }
};

async function fetchGarment(url: string): Promise<ImageInput | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!contentType.startsWith("image/")) return null;

  const data = Buffer.from(await response.arrayBuffer());
  if (data.length === 0 || data.length > MAX_IMAGE_BYTES) return null;

  return { data, mimeType: contentType };
}
