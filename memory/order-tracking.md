---
name: order-tracking
description: How TryOn tracks orders/funnel and the read_orders + PCD requirement
metadata:
  type: project
---

Order-conversion tracking (added 2026-05-22, user chose this over a Web Pixel) uses the **`orders/create` webhook** + the **`read_orders`** scope. History: dropped for App Store scope-minimization (commit 2c1574f), then re-enabled 2026-06-29 at user request (commit 4c3b2e4). Scopes are now `read_themes,read_orders` in `shopify.app.toml` (read_products stays omitted).

- Handler `app/routes/webhooks.orders.create.tsx` writes `OrderEvent` and sets `attributed=true` when a purchased product matches a recent (30-day) completed try-on for the shop — **product ids only, no customer PII**.
- Analytics (`getAnalytics` in `app/lib/tryon.server.ts`) surface orders, revenue, attributed orders, and a try-on→cart→order funnel; shown on dashboard + analytics page.

**Required manual step:** `read_orders` is Protected Customer Data, so the `orders/create` webhook will NOT deliver until the user requests **Protected Customer Data access** (Orders) in Partner Dashboard → API access. Until then, Orders/Revenue stay at 0. Adding the scope also re-prompts existing merchants to re-consent on next app load. See [[billing-model]] and the SUBMISSION_CHECKLIST.md.
