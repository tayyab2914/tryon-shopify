/**
 * Public marketing links for the landing page.
 *
 * The app isn't on the Shopify App Store yet, so the real listing URL
 * (https://apps.shopify.com/tryon) 404s. Until the listing is approved,
 * APP_STORE_URL points at the working install flow (/auth/login), so every
 * "Install" button on the landing actually installs the app.
 *
 * AFTER APPROVAL: set APP_STORE_URL back to the listing URL below.
 */
export const APP_STORE_LISTING_URL = "https://apps.shopify.com/tryon"; // live after approval
export const APP_STORE_URL = "https://tryon.solyio.com/auth/login";
export const INSTALL_CTA_LABEL = "Install on Shopify";

/**
 * Support / contact email shown on the privacy page, the embedded admin help
 * card, and in the App Store listing. Change this to a branded address (e.g.
 * support@yourdomain.com) before submitting — the listing requires a working
 * support email. Defaults to the developer account email so the surfaces are
 * valid out of the box.
 */
export const SUPPORT_EMAIL = "info@solyio.com";

/** Public privacy-policy URL — required for the App Store listing. */
export const PRIVACY_URL = "https://tryon.solyio.com/privacy";
