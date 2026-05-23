---
name: billing-model
description: TryOn Shopify app pricing tiers and the early-access free-plan mechanic
metadata:
  type: project
---

TryOn launches with a PAID billing model (decided 2026-05-22, confirmed by user over the brief's default-free suggestion). Tiers (monthly, USD), all metered by **completed** try-ons per calendar month (UTC):

- **Free** — 100 try-ons/mo, $0. Offered to early-access signups while `FREE_PLAN_OPEN` env is true. Later becomes the paid "Basic" tier.
- **Basic** — 100 try-ons/mo, $9.99.
- **Pro** — 500 try-ons/mo, $49.99.
- **Platinum** — 1000 try-ons/mo, $99.99.
- **Custom** — on demand, contact sales (mailto [[support-email]]). Effectively unlimited quota; assigned manually.

Mechanic: while `FREE_PLAN_OPEN !== "false"`, new installs default to FREE and are grandfathered (upsert only sets plan on create). When the user sets `FREE_PLAN_OPEN=false`, new installs default to BASIC with no chargeId → quota 0 until they subscribe (paywall). Billable plans require an active Shopify subscription (`Shop.chargeId` set) to grant quota; otherwise quota 0.

Implemented via Shopify Billing API in `@shopify/shopify-app-remix` v4.2 (`billing.request/check/cancel`), config in `app/shopify.server.ts`, catalog in `app/lib/plans.ts`, server logic in `app/lib/billing.server.ts`. `SHOPIFY_BILLING_TEST` env controls test vs real charges — **defaults to test mode** (so unapproved app + reviewers are never charged); set `SHOPIFY_BILLING_TEST=false` only after approval to charge real merchants. Storefront quota gating lives in `app/routes/api.tryon.tsx`; plan kept in sync via `app_subscriptions/update` webhook.

Deployed live 2026-05-22: Vercel prod (https://tryonshopify.vercel.app) + Shopify app version `tryon-solyio-4`.
