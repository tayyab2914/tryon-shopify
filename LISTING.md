# TryOn — Shopify App Store listing copy

Draft copy to paste into the Partner Dashboard listing form (Apps → TryOn →
Distribution → App listing). Field names match the Shopify listing editor.
Replace the bracketed placeholders before submitting.

> **Note on metrics:** This copy intentionally avoids hard performance numbers
> ("X% fewer returns", "Y% conversion lift"). Shopify reviewers reject
> unsubstantiated stats. The marketing landing page currently shows illustrative
> figures (30% fewer returns, 25% conversion lift) — either back them with a
> citation/case study or soften them before review, since the App Store listing
> links to that page.

---

## App name
**TryOn**

(≤30 characters. Registered app name is "TryOn". If you want more search
visibility you could use "TryOn ‑ AI Virtual Try‑On", but Shopify restricts
generic descriptors in app names — keep the descriptor in the tagline to be safe.)

## Tagline / subtitle  *(≤62 characters)*
**AI virtual try-on so shoppers see it on themselves first**

(56 characters. Alternatives, all under 62:)
- "Let shoppers try clothes on with AI before they buy" (51)
- "Photoreal AI try-on for your fashion storefront" (47)

## App introduction  *(shown in search; keep ~100 characters)*
Add an AI "Try On" button to your product pages. Shoppers upload a photo and see your garment on themselves.

---

## Short description  *(card / search-result blurb)*
TryOn adds a virtual fitting room to your store. Shoppers tap "Try On with AI"
on any product page, upload a photo, and see a photorealistic image of
themselves wearing the item — then add it straight to cart. No theme code, no
shopper accounts, and no photos are ever stored.

## Long description  *(App details)*
**See it on you. Before you buy.**

TryOn brings an AI virtual fitting room to your Shopify storefront. On any
product page, shoppers tap a "Try On with AI" button, upload a single photo,
and within seconds see a photorealistic render of themselves wearing your
garment. If they like it, they add it to the cart in one click — the real
Shopify cart, with the correct variant.

Helping shoppers picture the fit before checkout is designed to reduce
guesswork, lift confidence, and cut the size-and-style returns that eat into
fashion margins.

**Built natively for Shopify**
TryOn installs through a Theme App Extension — flip on the "TryOn Widget" app
embed in your theme and the button appears automatically on product (and
collection) pages. No code, no theme edits, no developer required.

**Privacy by design**
Shopper photos are processed in-memory by the AI and are never stored — not in
a database, not on disk, not in logs. The only thing recorded per try-on is a
non-identifiable, salted hash of the visitor's IP (used purely for your
rate-limit setting). All of Shopify's mandatory GDPR webhooks are implemented,
and every byte of your shop's data is permanently deleted when you uninstall.

**You stay in control**
A clean embedded dashboard lets you:
- turn the widget on or off,
- deeply customize the button (label, style, shape, size, placement, color), choose which pages it appears on, and edit the modal title, add-to-cart label, and consent text,
- cap how many try-ons each visitor can run (per day or per month),
- and track the full funnel — try-ons, add-to-cart, orders, revenue, and try-on-influenced orders — over time.

Start free — add a virtual fitting room to your store in minutes, then scale up
as your try-on volume grows.

---

## Key benefits  *(Shopify shows 3; title ≤ ~40 chars, body ≤ ~80 chars)*

1. **Shoppers try before they buy**
   A photoreal AI fitting room on every product page, in seconds.

2. **One-click, no-code install**
   Enable the app embed in your theme — the button appears automatically.

3. **Privacy-first by design**
   Photos are never stored. GDPR webhooks honored. Data deleted on uninstall.

---

## Feature bullets  *(App features list)*
- **Photoreal AI try-on** — garment rendered onto the shopper while keeping face, pose, and product detail faithful.
- **Native Shopify integration** — Theme App Extension embed; works on product and collection pages with no theme code.
- **Real add-to-cart** — adds the correct variant to the live Shopify cart, then opens the cart drawer.
- **Customizable widget** — control the button label, accent color, placement, and consent text from the admin.
- **Per-visitor rate limiting** — cap try-ons per shopper (daily or monthly) to manage usage.
- **Full-funnel analytics** — try-ons, add-to-cart, orders, revenue, and try-on-influenced orders in a built-in dashboard.
- **Privacy by design** — no photos stored; only a salted, non-identifiable IP hash is kept.

---

## Category suggestion
- **Primary:** Store design → Product page  *(virtual try-on enhances the product page)*
- **Alternative / secondary:** Marketing and conversion → Conversion
- Add the tag **"Merchandising"** if a third tag slot is available.

(Pick the single best-fit primary in the dashboard; "Store design" is the
closest match for an on-product-page widget.)

---

## Pricing
**Free to install. Free plan available, with paid tiers for higher volume.**

Quotas count completed try-ons and reset on the 1st of each month.

| Plan | Price | Try-ons / month |
| --- | --- | --- |
| Free | $0 | 100 (early-access stores) |
| Basic | $9.99 / mo | 100 |
| Pro | $49.99 / mo | 500 |
| Platinum | $99.99 / mo | 1,000 |
| Custom | Contact us | Higher volume on request |

> The Free plan is offered to early-access stores while `FREE_PLAN_OPEN=true`.
> When you end early access (set `FREE_PLAN_OPEN=false`), new installs start on
> Basic and existing free stores keep their plan. Set these as the pricing plans
> in the Partner Dashboard so the listing's pricing card matches the in-app
> Billing page. Paid plans are billed monthly through Shopify.

---

## Required URLs & contact
- **App URL:** https://tryonshopify.vercel.app
- **Privacy policy URL:** https://tryonshopify.vercel.app/privacy
- **Support email:** abdullahkhn8902@gmail.com  *(replace with a branded support address before submitting — update `SUPPORT_EMAIL` in `app/lib/links.ts` so the privacy page and admin Help card match)*
- **Faq / support page (optional):** [add if you create one]

---

## How to test  *(reviewer instructions — paste into "Testing instructions")*

No special credentials are needed beyond installing on a development store.

1. **Install** the app on a development store and approve the requested scopes (`read_products`, `read_orders`).
2. The **embedded dashboard** loads automatically. (On a brand-new store it shows zero stats and a banner prompting you to enable the widget — this is expected.)
3. From the dashboard, click **"Open theme editor"**. In the theme editor, open **App embeds**, toggle on **"TryOn Widget"**, and click **Save**.
4. Visit any **product page** on the storefront. A **"Try On with AI"** button appears near the Add to Cart button.
5. Click it. In the modal, **tick the consent checkbox**, then upload a clear, front-facing photo of a person (JPG/PNG/WebP, under 10 MB).
6. Wait ~10–20 seconds. The AI returns a photorealistic image of the person wearing the product.
7. Click **"Add to Bag"** — the product's variant is added to the real Shopify cart.
8. Return to the app's **Dashboard** and **Analytics** pages: the try-on and add-to-cart events now appear in the stats and recent activity.
9. (Optional, order tracking) Place a test order containing that product. The **Orders**, **Revenue**, and **conversion funnel** on the Analytics page update once the `orders/create` webhook is delivered (requires approved Protected Customer Data access).

**Demo store:** Provide reviewers with a development/demo store that already has
the "TryOn Widget" app embed enabled and at least one apparel product with a
clear garment image, so they can skip straight to step 4. Include a sample
person photo they can upload if helpful.

---

## Assets still needed (you provide these in the dashboard)
- App **icon** (1200×1200 px, no transparency).
- **Feature image / banner** (1600×900 px).
- 3–6 **screenshots** (1600×900 px): dashboard, the storefront button on a product page, the try-on modal mid-result, the analytics page, the customization page.
- Optional **demo video**.
