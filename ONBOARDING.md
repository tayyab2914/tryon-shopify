# TryOn — New Developer Manual

Welcome. This is a plain-English guide to the TryOn Shopify app: what it is, how
to set it up on your machine, how it connects to Shopify, how it deploys, and how
it gets published to the Shopify App Store. No prior Shopify knowledge assumed.

If you only read one section, read **"1. The mental model"** and **"4. First-time
setup"**.

---

## 1. The mental model (what this app actually is)

TryOn is a **virtual try-on widget** for Shopify clothing stores. A shopper
uploads a photo on a product page, the app uses Google's Gemini AI to generate an
image of them "wearing" the garment, and then they can add the item to their cart.
The merchant gets analytics on try-ons, cart-adds, and orders.

There are **three moving parts** that work together:

1. **The embedded admin app** — what the *merchant* sees inside their Shopify
   admin. Dashboard, analytics, settings, billing. Built with Remix + Shopify
   Polaris (UI kit) + App Bridge (the thing that lets our app live inside an
   iframe in Shopify's admin).

2. **The storefront widget** — what the *shopper* sees on the live store. A
   "Try On with AI" button injected into product pages. It's a plain JavaScript
   file ([public/embed.js](public/embed.js)) loaded by a **Theme App Extension**
   ([extensions/tryon-embed/](extensions/tryon-embed/)).

3. **The backend / API** — Remix server routes that the widget calls
   (`api.tryon`, `api.cart-add`, `api.widget.$shop`), the AI client
   ([app/lib/gemini.server.ts](app/lib/gemini.server.ts)), the database (Prisma +
   Postgres), and Shopify webhooks (install/uninstall, GDPR, orders).

It is built on the official **Shopify Remix app template**. The
`@shopify/shopify-app-remix` library handles the hard parts: OAuth login, session
storage, and verifying webhook signatures. You rarely touch that machinery
directly — you configure it in [app/shopify.server.ts](app/shopify.server.ts).

**Tech stack at a glance:**

| Layer | What we use |
|---|---|
| Framework | Remix (with Vite) |
| Admin UI | Shopify Polaris + App Bridge React |
| Storefront | Theme App Extension + vanilla `embed.js` |
| AI | `@google/genai` → Gemini (via Vertex AI) |
| Database | Prisma ORM → PostgreSQL (Supabase) |
| Hosting | Vercel (serverless) |
| Shopify glue | `@shopify/shopify-app-remix` + Shopify CLI |

---

## 2. Accounts & tools you need

Before you can run anything, get access to these. Ask whoever owns the project
for the ones marked **(shared)**.

- **Node.js** — version `>=20.19 <22` or `>=22.12` (see `engines` in
  [package.json](package.json)). Check with `node -v`.
- **A Shopify Partner account** — free, at <https://partners.shopify.com>. This
  is where the app is registered. **(shared — you need to be invited to the
  existing "TryOn" app, or you'll create your own test app.)**
- **A Shopify development store** — a free fake store for testing, created from
  inside the Partner Dashboard. You install the app here.
- **A Google Cloud project with Vertex AI** — powers the AI image generation.
  **(shared — the service-account key is already in `.env`.)**
- **A Supabase Postgres database** — stores all app data. **(shared — connection
  strings are in `.env`.)**
- **A Vercel account** — where the production app is hosted. **(shared — you need
  to be added to the Vercel project to deploy.)**

The **Shopify CLI** is already installed as a dev dependency (`@shopify/cli`), so
you run it through `npm` scripts — you don't install it globally.

---

## 3. How "connecting to Shopify" works (read this once, it'll save you confusion)

This is the part that confuses every new Shopify dev. Three things define the
connection:

### a) The app registration (in the Partner Dashboard)
Your app is registered on Shopify's side and has a **Client ID** (a.k.a. API key)
and a **Client secret**. Our Client ID is already written in
[shopify.app.toml](shopify.app.toml):

```toml
client_id = "b7677929f573feaedf28eb320e9ee8da"
name = "TryOn"
application_url = "https://tryonshopify.vercel.app"
```

### b) `shopify.app.toml` — the app's configuration as code
This file is the source of truth for the app's settings: its URL, the OAuth
redirect URLs, the **access scopes** (permissions) it requests, and the
**webhooks** it subscribes to. When you run `npm run deploy`, this file is pushed
up to Shopify.

Current scopes: `read_products,read_orders`. (`read_orders` is "protected customer
data" and needs separate approval in the Partner Dashboard — see §9.)

### c) Environment variables — the secrets
The library in [app/shopify.server.ts](app/shopify.server.ts) reads:
`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, and `SCOPES`.

**Important:** when you run the app locally with `npm run dev`, the **Shopify CLI
injects these four variables for you automatically.** You do **not** put them in
`.env` for local dev. (In production on Vercel, they *are* set as Vercel env vars
— see §7.)

### The OAuth install flow (what happens when a merchant clicks "Install")
1. Merchant visits the install URL → Shopify shows a permissions screen (the
   scopes from the toml).
2. Merchant approves → Shopify redirects to one of our `auth/callback` URLs.
3. `@shopify/shopify-app-remix` exchanges the code for an access token, stores a
   **Session** row in our database, and upserts a **Shop** row.
4. Merchant lands in our embedded admin dashboard.

You don't write this flow — it's handled by [app/routes/auth.$.tsx](app/routes/auth.$.tsx)
calling `authenticate.admin()`.

---

## 4. First-time setup (do this in order)

> All commands run from the project root in PowerShell (Windows). The `&&`
> operator does **not** work in Windows PowerShell — run commands one per line, or
> use `;` between them.

### Step 1 — Install dependencies
```powershell
npm install --legacy-peer-deps
```
(`--legacy-peer-deps` matches what Vercel uses; see [vercel.json](vercel.json).)

### Step 2 — Create your `.env` file
Copy the example and fill it in:
```powershell
Copy-Item .env.example .env
```
Then open `.env` and provide the secrets. **Remember from §3: you do NOT add the
four `SHOPIFY_*` / `SCOPES` vars locally — the CLI provides them.** What you DO
need locally:

- **AI engine** — either Vertex AI (`USE_VERTEX=true` + `GOOGLE_CLOUD_PROJECT`,
  `GOOGLE_CLOUD_LOCATION`, `GCP_SERVICE_ACCOUNT_KEY`) **or** the simpler Gemini
  Developer API (`USE_VERTEX=false` + `GEMINI_API_KEY` from
  <https://aistudio.google.com/apikey>).
- **`DATABASE_URL`** and **`DIRECT_URL`** — the Postgres connection strings
  (Supabase). `DATABASE_URL` is the pooled runtime connection; `DIRECT_URL` is the
  direct connection used for migrations.
- **`SHOP_IP_SALT`** — any long random string. Generate one with:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

> If the project owner already gave you a populated `.env`, just use it — but
> treat it as a secret (see §11). The committed example never contains real values.

### Step 3 — Set up the database
The schema is Postgres ([prisma/schema.prisma](prisma/schema.prisma)). Generate
the client and apply migrations:
```powershell
npx prisma generate
npx prisma migrate deploy
```
- `prisma generate` builds the typed DB client your code imports.
- `migrate deploy` applies existing migrations in [prisma/migrations/](prisma/migrations/)
  to your database.
- To inspect data visually: `npx prisma studio`.

### Step 4 — Link the app to Shopify
This connects your local checkout to the registered Shopify app:
```powershell
npm run config:link
```
Pick the "TryOn" app when prompted. This confirms `client_id` /
`application_url` in `shopify.app.toml`. (If you're using your own test app
instead of the shared one, this is where you'd point at it.)

### Step 5 — Run it
```powershell
npm run dev
```
The Shopify CLI will:
- start a secure tunnel to your machine,
- inject the `SHOPIFY_*` env vars,
- start the Remix dev server **and** the Theme App Extension dev server,
- print a URL to install/open the app on your dev store.

Open that URL, install on your dev store, and you should land in the embedded
dashboard.

### Step 6 — Turn on the storefront widget
1. In your dev store admin: **Online Store → Themes → Customize**.
2. **App embeds** (bottom-left icon) → enable **"TryOn Widget"**.
3. Open any product page on the storefront → the "Try On with AI" button appears.

---

## 5. Day-to-day development workflow

- **Run locally:** `npm run dev` (keep it running; it hot-reloads).
- **Lint:** `npm run lint`.
- **Type-check / build:** `npm run build`.
- **Database changed?** Edit [prisma/schema.prisma](prisma/schema.prisma), then
  `npx prisma migrate dev --name describe_your_change`. This creates a new
  migration file and updates your DB. Commit the migration folder.
- **Inspect data:** `npx prisma studio`.
- **Editing the storefront widget** ([public/embed.js](public/embed.js) or the
  extension): the CLI's extension dev server reloads it. To point a real store at
  your local tunnel, set the "App URL (advanced)" field in the app embed settings
  to your tunnel URL (normally left blank so it uses production).

---

## 6. The codebase map (where things live)

```
app/
├── shopify.server.ts        # Shopify app config: scopes, billing plans, session storage
├── db.server.ts             # Single shared Prisma client
├── lib/                     # Server-only helpers (never sent to the browser)
│   ├── gemini.server.ts     # Gemini AI image generation
│   ├── tryon.server.ts      # Orchestrates a try-on + records analytics
│   ├── billing.server.ts    # Subscription/plan checks against Shopify Billing
│   ├── plans.ts             # Plan catalog (Free/Basic/Pro/Platinum/Custom) — pure data
│   ├── shop.server.ts       # Look up / create the Shop row
│   ├── rate-limit.server.ts # Per-IP try-on limit (uses SHOP_IP_SALT)
│   ├── cors.server.ts       # CORS headers for storefront → API calls
│   └── links.ts             # Public URLs + support email
├── routes/
│   ├── _index/              # Public marketing landing page
│   ├── app.tsx              # Layout/auth wrapper for all embedded admin pages
│   ├── app._index.tsx       # Dashboard (stats + recent try-ons)
│   ├── app.analytics.tsx    # Charts + top products
│   ├── app.customization.tsx# Widget appearance settings
│   ├── app.settings.tsx     # Enable toggle + rate limit
│   ├── app.billing.tsx      # Plan / upgrade page
│   ├── api.tryon.tsx        # POST: run a try-on (called by the storefront widget)
│   ├── api.cart-add.tsx     # POST: log a cart-add event
│   ├── api.widget.$shop.tsx # GET: widget config for a given shop (CORS)
│   ├── auth.$.tsx           # OAuth entry point
│   ├── auth.login/          # Login screen
│   ├── privacy.tsx          # Privacy policy (required for the App Store)
│   └── webhooks.*.tsx       # app/uninstalled, scopes_update, subscriptions,
│                            #   orders/create, and the 3 GDPR webhooks
extensions/tryon-embed/      # Theme App Extension that injects embed.js
public/embed.js              # The storefront widget script itself
prisma/schema.prisma         # DB models: Session, Shop, TryOn, CartAdd, OrderEvent
shopify.app.toml             # App config pushed to Shopify (URL, scopes, webhooks)
vite.config.ts               # Build config (incl. Vercel preset, SSR bundling)
vercel.json                  # Vercel build/install commands
```

**Naming convention:** files ending in `.server.ts` run only on the server and
are stripped from the browser bundle — that's where secrets and DB access live.

**Database models** (in [prisma/schema.prisma](prisma/schema.prisma)):
- `Session` — Shopify auth sessions (managed by the library, don't edit).
- `Shop` — one row per installed store; holds all widget settings + plan/billing.
- `TryOn` — one row per try-on attempt.
- `CartAdd` — logged when a shopper adds a tried-on item to cart.
- `OrderEvent` — created by the `orders/create` webhook; `attributed = true` when
  the order matched a recent try-on (this is the conversion metric).

---

## 7. Deploying to production

Production runs on **Vercel** at <https://tryonshopify.vercel.app>. There are
**two separate deploys**, and you usually do both:

### Deploy 1 — the app code (to Vercel)
```powershell
npx vercel --prod --yes
```
Vercel runs `npm run vercel-build` (`prisma generate && remix vite:build`). The
`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`,
`DATABASE_URL`, `DIRECT_URL`, `GCP_SERVICE_ACCOUNT_KEY` (etc.) must be set as
**Vercel project environment variables** — these are NOT read from your local
`.env` in production.

### Deploy 2 — the Shopify config + theme extension
```powershell
npx shopify app deploy --force
```
This pushes [shopify.app.toml](shopify.app.toml) (scopes, webhooks,
`application_url`) and the Theme App Extension up to Shopify. **Run this whenever
you change scopes, webhooks, or the extension** — otherwise Shopify still has the
old config even though Vercel has the new code.

> Rule of thumb: changed a `.ts`/`.tsx` file? → Vercel deploy. Changed
> `shopify.app.toml` or `extensions/`? → also `shopify app deploy`.

### Quick post-deploy smoke test
```powershell
curl.exe -s -o NUL -w "%{http_code}`n" https://tryonshopify.vercel.app/
curl.exe -s -o NUL -w "%{http_code}`n" https://tryonshopify.vercel.app/privacy
```
Both should print `200`. Then install on a dev store and run a full try-on.

---

## 8. Billing (how merchants pay)

- The plan catalog lives in [app/lib/plans.ts](app/lib/plans.ts): **Free, Basic
  ($9.99), Pro ($49.99), Platinum ($99.99), Custom**.
- The **billable** plans (Basic/Pro/Platinum) are also configured in the `billing`
  block of [app/shopify.server.ts](app/shopify.server.ts). **The plan names must
  match exactly across both files and the Partner Dashboard pricing page** — if
  you rename one, rename all three.
- Free and Custom are DB-only states (no Shopify charge). A billable plan only
  grants its quota once it has an active `chargeId` (set when the merchant
  approves the charge in Shopify).
- **Test vs real charges:** billing defaults to **test mode** so reviewers and
  unapproved installs are never charged for real. To charge real money, set
  `SHOPIFY_BILLING_TEST=false` in Vercel and redeploy — only after the listing is
  approved.

---

## 9. Publishing to the Shopify App Store

The full step-by-step lives in [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md)
and the listing copy is in [LISTING.md](LISTING.md). Here's the plain summary —
most of this happens in the **Partner Dashboard**, not in code:

1. **Ship the code first** — run both deploys from §7.
2. **Create the pricing plans** in Partner Dashboard → Apps → TryOn →
   Distribution → Pricing. Names must match `Basic` / `Pro` / `Platinum` exactly.
3. **Set distribution to Public** (App Store).
4. **Fill in the listing** — name, descriptions, benefits, category. Copy from
   [LISTING.md](LISTING.md).
5. **Upload assets** — app icon (1200×1200), feature image (1600×900), 3–6
   screenshots (1600×900).
6. **Set required URLs** — App URL `https://tryonshopify.vercel.app`, Privacy
   policy `https://tryonshopify.vercel.app/privacy`, and a working support email.
7. **Request Protected Customer Data access** — required because we use
   `read_orders` / the `orders/create` webhook. Partner Dashboard → your app →
   API access → Protected customer data access → Manage → select **Orders**. Do
   this **early**; approval takes time.
8. **Provide a demo store** with the widget enabled and reviewer test
   instructions (from [LISTING.md](LISTING.md)). Keep billing in test mode.
9. **Submit.** Review takes ~1–2 weeks.
10. **After approval** — point `APP_STORE_URL` in
    [app/lib/links.ts](app/lib/links.ts) back to the real listing URL, and (if
    ending early access) set `FREE_PLAN_OPEN=false` in Vercel.

GDPR/compliance webhooks (`customers/data_request`, `customers/redact`,
`shop/redact`) are already implemented and HMAC-verified — Shopify requires these
and they're in [shopify.app.toml](shopify.app.toml).

---

## 10. Troubleshooting & common gotchas

- **"Missing SHOPIFY_API_KEY" locally** → you tried to run without the CLI. Use
  `npm run dev` (the CLI injects it); don't run `remix vite:dev` directly.
- **PowerShell `&&` errors** → Windows PowerShell doesn't support `&&`. Run
  commands separately or join with `;`.
- **Widget button doesn't appear on the storefront** → the app embed isn't
  enabled (see §4 step 6), or you're not on a product/collection page (the script
  only shows the button there).
- **Database/migration errors** → migrations use `DIRECT_URL` (session pooler),
  runtime uses `DATABASE_URL` (transaction pooler). If migrations hang, confirm
  `DIRECT_URL` is set and reachable.
- **Changed scopes/webhooks but nothing happened in Shopify** → you forgot
  `npx shopify app deploy`. Code deploy ≠ config deploy (§7).
- **Vercel build can't find `@shopify/shopify-api`** → already handled by the
  `ssr.noExternal` block in [vite.config.ts](vite.config.ts); don't remove it.
- **AI returns errors** → check the AI env vars. Vertex needs a valid
  `GCP_SERVICE_ACCOUNT_KEY` (base64 JSON) with the Vertex AI User role; the
  Developer API just needs `GEMINI_API_KEY` and `USE_VERTEX=false`.

---

## 11. Secrets & safety (please read)

- `.env` is **gitignored** and contains **live secrets**: a Google Cloud
  service-account private key, the Supabase database password, and the IP salt.
  Never commit it, never paste it into chats/tickets/screenshots, and never put
  real values in `.env.example`.
- If a secret is ever exposed, **rotate it**: regenerate the Google
  service-account key, reset the Supabase DB password, and change `SHOP_IP_SALT`
  (note: changing the salt resets everyone's rate-limit window).
- Production secrets live in **Vercel's environment variables**, not in the repo.
- Shopper photos are processed in-memory by Gemini and discarded — we never store
  them. The only visitor identifier kept is a salted SHA-256 hash of the IP.

---

## Quick reference — commands

| Task | Command |
|---|---|
| Install deps | `npm install --legacy-peer-deps` |
| Run locally | `npm run dev` |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Apply DB migrations | `npx prisma migrate deploy` |
| New DB migration | `npx prisma migrate dev --name <change>` |
| Browse the DB | `npx prisma studio` |
| Link to Shopify app | `npm run config:link` |
| Deploy app code | `npx vercel --prod --yes` |
| Deploy Shopify config | `npx shopify app deploy --force` |
