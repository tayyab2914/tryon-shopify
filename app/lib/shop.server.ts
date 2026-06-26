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
 * Ensure a Shop row exists for an authenticated merchant. Runs on every admin
 * request (cheap: a single indexed read when the shop is already active).
 *
 * - New shop: create with the current entry plan (Free while early-access is
 *   open, otherwise Basic).
 * - Reinstall (row exists but was uninstalled): clear `uninstalledAt` AND
 *   re-enable the widget, so a reinstalled merchant/reviewer sees the storefront
 *   widget again without having to re-toggle it in Settings. The plan is never
 *   touched, so a grandfathered Free status is preserved. (Required for App
 *   Store review: the reviewer reinstalls to test billing, and the widget must
 *   still appear afterward — req 2.1.1.)
 * - Already active: nothing changes — a merchant who turned the widget off
 *   stays off.
 */
export async function upsertShop(shopDomain: string) {
  const existing = await db.shop.findUnique({
    where: { shopDomain },
    select: { uninstalledAt: true },
  });

  if (!existing) {
    await db.shop.create({
      // Per-visitor rate limiting is opt-in (off by default) so a new merchant —
      // or an App Store reviewer testing the headline feature repeatedly from one
      // IP — isn't throttled out of the box. The monthly plan quota still caps
      // total usage, and merchants can enable the per-visitor cap in Settings.
      data: {
        shopDomain,
        plan: defaultPlanForNewShop(),
        tryOnLimitEnabled: false,
      },
    });
    return;
  }

  if (existing.uninstalledAt) {
    await db.shop.update({
      where: { shopDomain },
      data: { uninstalledAt: null, widgetEnabled: true },
    });
  }
}
