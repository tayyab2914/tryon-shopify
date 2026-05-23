# TryOn — Shopify app

Virtual try-on widget for Shopify merchants. One-click install, embedded
admin built with Polaris + App Bridge, real `/cart/add.js` integration, and
aggregate try-on / cart-add / order analytics in the merchant dashboard.

Built on the Shopify Remix template — `@shopify/shopify-app-remix` handles
OAuth, session storage, and webhook verification.

## Stack

- **Remix** (Vite) + **Polaris** + **App Bridge**
- **Prisma** with SQLite for local dev; swap the datasource block in
  [prisma/schema.prisma](prisma/schema.prisma) to `postgresql` for production
- **`@google/genai`** — Gemini (Vertex or Developer API) for image generation
- **Theme App Extension** — auto-injects the storefront widget script

## Project layout

```
app/
├── lib/                       # Server-only helpers
│   ├── cors.server.ts         # CORS headers for storefront API
│   ├── gemini.server.ts       # Gemini image-generation client
│   ├── rate-limit.server.ts   # Per-IP try-on limit
│   ├── shop.server.ts         # Shop lookup / upsert
│   └── tryon.server.ts        # Try-on orchestration + analytics
├── routes/
│   ├── app._index.tsx         # Embedded admin home (stats + recent try-ons)
│   ├── app.analytics.tsx      # Daily chart + top products
│   ├── app.customization.tsx  # Widget appearance form
│   ├── app.settings.tsx       # Enable toggle + rate limit
│   ├── app.billing.tsx        # Stub — free during beta
│   ├── api.widget.$shop.tsx   # GET widget config (CORS)
│   ├── api.tryon.tsx          # POST run a try-on (CORS, Gemini)
│   ├── api.cart-add.tsx       # POST log a cart-add event (CORS)
│   └── webhooks.*.tsx         # Lifecycle + GDPR + orders/create
├── shopify.server.ts          # Shopify app config
└── db.server.ts               # Prisma client singleton
extensions/
└── tryon-embed/               # Theme App Extension (app embed block)
public/
└── embed.js                   # Storefront widget script
prisma/
└── schema.prisma              # Shop, TryOn, CartAdd, OrderEvent
```

## Setup

### 1. Install

Already installed via `npm install`. To re-run:

```sh
npm install
```

### 2. Environment variables

Create `.env` at the repo root:

```env
# Shopify — fill in after `npm run config:link`
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=
SCOPES=read_products,write_metafields

# Gemini (Vertex AI)
USE_VERTEX=true
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=global
GCP_SERVICE_ACCOUNT_KEY=        # raw JSON or base64-encoded JSON

# OR: Gemini Developer API (simpler, no GCP)
# USE_VERTEX=false
# GEMINI_API_KEY=

# Rate-limit salt — any random string; rotating it resets all per-IP windows
SHOP_IP_SALT=

# Optional: override default Gemini pricing for cost telemetry
# PRICE_INPUT_TEXT_PER_1M=0.5
# PRICE_INPUT_IMAGE_PER_1M=0.5
# PRICE_OUTPUT_TEXT_PER_1M=3.0
# PRICE_OUTPUT_IMAGE_PER_1M=60.0
```

### 3. Database

SQLite, zero setup — `prisma migrate dev` already ran during scaffolding.
The `dev.sqlite` file is at the repo root.

For Postgres (production), switch the `datasource db` block in
[prisma/schema.prisma](prisma/schema.prisma):

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Then `npx prisma migrate dev --name init`.

### 4. Link the Shopify app

Create the app in the Shopify Partner Dashboard, then link it:

```sh
npm run config:link
```

This populates `client_id` and `application_url` in
[shopify.app.toml](shopify.app.toml) and writes
`SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` into `.env`.

### 5. Run

```sh
npm run dev
```

The Shopify CLI starts a tunnel, prints an install URL, and runs the Theme
App Extension dev server.

## Storefront install (for merchants)

1. Click "Install" — Shopify redirects through OAuth; the app upserts a
   `Shop` row and lands in the embedded admin
2. In the theme editor (Apps → "TryOn Widget"), enable the **app embed**
3. Visit any product page — the Try On button appears

## Verification on a dev store

| Step | Expectation |
|---|---|
| Install on dev store | `Shop` and `Session` rows created; webhooks registered |
| Enable app embed | `embed.js` loads on storefront with correct `data-shop` |
| Try-on + Add to Bag | Item appears in cart; `TryOn` + `CartAdd` rows linked |
| Complete checkout | `OrderEvent` row created |
| Admin → Analytics | Try-on / cart-add / order counts match DB |
| Customize widget | Saving updates `Shop` row; widget reflects new label/color |
| Uninstall | `Shop.uninstalledAt` set; `Session` rows deleted |
| `shop/redact` (48h post-uninstall) | `Shop` row hard-deleted with cascade |

## Privacy

Shopper photos are processed in-memory by Gemini and discarded. The only
visitor identifier we store is a salted SHA-256 hash of the IP, used solely
to enforce the per-visitor rate limit. No customer-identifiable data leaves
the request lifecycle.

## What's deferred

- **Shopify Billing API** — schema fields (`plan`, `chargeId`, `trialEndsAt`)
  are in place but no charging flow yet. The Billing page is a stub.
- **Postgres migration** — SQLite is fine for dev; switch the datasource
  before deploying.
- **App Store submission** — all mandatory pieces (OAuth, GDPR webhooks,
  Theme App Extension, embedded admin) are in place; submission flow itself
  is a separate workstream.
