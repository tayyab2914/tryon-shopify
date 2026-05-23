import db from "../db.server";
import { defaultPlanForNewShop } from "./billing.server";

/**
 * Normalises an incoming "shop" identifier (origin header, query param, or
 * data attribute) to a canonical `.myshopify.com` domain string, or null if
 * it doesn't look like one. Storefronts can be served from custom domains;
 * the shop's permanent `.myshopify.com` domain is what we key on internally.
 */
export function normaliseShopDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  let host = value.trim().toLowerCase();
  try {
    if (host.includes("://")) host = new URL(host).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host)) return null;
  return host;
}

/** Look up a Shop by its `.myshopify.com` domain. Returns null if not found. */
export async function getShopByDomain(shopDomain: string) {
  return db.shop.findUnique({ where: { shopDomain } });
}

/**
 * Look up the bare set of widget-config fields a storefront request needs.
 * Cached at the CDN for ~60s via `Cache-Control`, so the DB cost is light.
 */
export async function getWidgetConfig(shopDomain: string) {
  return db.shop.findUnique({
    where: { shopDomain },
    select: {
      id: true,
      widgetEnabled: true,
      buttonLabel: true,
      accentColor: true,
      consentText: true,
      buttonPlacement: true,
      buttonStyle: true,
      buttonRadius: true,
      buttonSize: true,
      showOnProduct: true,
      showOnCollection: true,
      modalTitle: true,
      addToCartLabel: true,
      tryOnLimitEnabled: true,
      tryOnLimitPerIp: true,
      tryOnLimitPeriod: true,
    },
  });
}

/**
 * Upsert a Shop row at install time. Idempotent — re-running an install just
 * clears `uninstalledAt` and never touches the plan, so an existing merchant's
 * plan (and any grandfathered Free status) is preserved. New shops get the
 * current entry plan (Free while early-access is open, otherwise Basic).
 */
export async function upsertShop(shopDomain: string) {
  return db.shop.upsert({
    where: { shopDomain },
    update: { uninstalledAt: null },
    create: { shopDomain, plan: defaultPlanForNewShop() },
  });
}
