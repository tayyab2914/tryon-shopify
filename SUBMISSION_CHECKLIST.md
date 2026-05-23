# TryOn — App Store submission checklist

Everything below happens in the **Shopify Partner Dashboard** (and one deploy from
this repo). I can't do these for you — they require your Partner login and
uploading assets. Work top to bottom.

## 0. Ship the code first
From the repo root:

```bash
# 1. Deploy the Remix app (env vars already set in the Vercel project)
npx vercel --prod --yes

# 2. Deploy the Shopify config + theme extension
#    (registers the new app_subscriptions/update webhook and the billing config)
npx shopify app deploy --force
```

Then smoke-test (see "Post-deploy verification" at the bottom).

> **Test vs real charges.** Billing defaults to **test mode** (no real charge),
> so an unapproved app and App Store reviewers can never be billed by accident.
> When the listing is approved and you're ready to charge real merchants, set
> `SHOPIFY_BILLING_TEST=false` in the Vercel project env and redeploy. Leave it
> unset (test) until then.

---

## 1. Pricing plans (Partner Dashboard → Apps → TryOn → Distribution → Pricing)
Create plans that match the in-app Billing page and `LISTING.md`:

- [ ] **Free** — $0 — 100 try-ons/month (early access)
- [ ] **Basic** — $9.99/month — 100 try-ons/month
- [ ] **Pro** — $49.99/month — 500 try-ons/month
- [ ] **Platinum** — $99.99/month — 1,000 try-ons/month
- [ ] **Custom** — "Contact us" (no self-serve charge)

The plan **names must match exactly**: `Basic`, `Pro`, `Platinum` (these are the
billing config keys in `app/shopify.server.ts`). If you rename a plan, update
both places.

## 2. Distribution
- [ ] Set distribution to **Public** (App Store).

## 3. App listing content (paste from `LISTING.md`)
- [ ] App name, tagline/subtitle (≤62 chars), app introduction
- [ ] Short + long description
- [ ] 3 key benefits
- [ ] Feature bullets
- [ ] Primary category (suggested: **Store design → Product page**)
- [ ] **Replace the support email** placeholder (`abdullahkhn8902@gmail.com`)
      with a branded address — update `SUPPORT_EMAIL` in `app/lib/links.ts`,
      redeploy, then paste the same address into the listing.

## 4. Assets (you upload these)
- [ ] App **icon** — 1200×1200 px, no transparency
- [ ] **Feature image** — 1600×900 px
- [ ] 3–6 **screenshots** — 1600×900 px (dashboard, storefront button on a
      product page, try-on modal mid-result, analytics page, customization page)
- [ ] Optional demo video

## 5. Required URLs
- [ ] **App URL:** https://tryonshopify.vercel.app
- [ ] **Privacy policy URL:** https://tryonshopify.vercel.app/privacy
- [ ] **Support email:** (your branded address from step 3)

## 6. Compliance & data access
- [ ] GDPR webhooks present & HMAC-verified: `customers/data_request`,
      `customers/redact`, `shop/redact` (plus `app/uninstalled`,
      `app/scopes_update`, `app_subscriptions/update`, `orders/create`). All return 200.
- [ ] **Scopes are now `read_products,read_orders`.** Existing merchants are
      re-prompted to approve the new scope on their next app load (handled by the
      managed install + `app/scopes_update` webhook).
- [ ] **Request Protected Customer Data access** (required for `read_orders` /
      `orders/create`): Partner Dashboard → your app → **API access** →
      **Protected customer data access** → Manage. Select **Orders** and give the
      reason: *order-conversion analytics (we read only product ids + order totals
      to attribute purchases to try-ons; no customer PII is stored)*. You do **not**
      need any "Protected customer fields" (name/email/address/phone) — leave those
      unselected. Approval can take part of the review cycle, so request it early.

## 7. Demo store + reviewer instructions
- [ ] Provide a **development/demo store** with the "TryOn Widget" app embed
      already enabled and at least one apparel product with a clear image.
- [ ] Paste the **"How to test"** steps from `LISTING.md` into the testing
      instructions field. Mention a sample person photo if helpful.
- [ ] Keep `SHOPIFY_BILLING_TEST` in test mode while the reviewer tests so the
      upgrade flow can be exercised without a real charge.

## 8. Submit
- [ ] Submit for review. Expect roughly **1–2 weeks**; reviewers may reply with
      change requests.

## 9. After approval
- [ ] In `app/lib/links.ts`, set `APP_STORE_URL = APP_STORE_LISTING_URL`
      (i.e. back to https://apps.shopify.com/tryon), redeploy.
- [ ] (If applicable) update the same install link in the separate Next.js
      marketing site (`../TryOn`, `lib/shopify-app.ts`).
- [ ] If you ended early access, set `FREE_PLAN_OPEN=false` in Vercel so new
      installs start on Basic (existing free stores are grandfathered).

---

## Post-deploy verification (run after step 0)
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tryonshopify.vercel.app/           # 200 (landing)
curl -s -o /dev/null -w "%{http_code}\n" https://tryonshopify.vercel.app/privacy    # 200 (policy)
curl -s https://tryonshopify.vercel.app/api/widget/some-test-shop.myshopify.com     # clean JSON 404 ("Shop not installed.")
```
Then, on a dev store: install → embedded dashboard loads → enable the app embed →
open a product → run a try-on → "Add to Bag" adds to cart → dashboard/analytics
reflect it. Open **Billing** and confirm the plan + usage render and an upgrade
redirects to Shopify's approval screen (test mode).
```
