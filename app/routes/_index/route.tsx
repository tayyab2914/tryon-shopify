import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";
import { APP_STORE_URL, INSTALL_CTA_LABEL, SUPPORT_EMAIL } from "../../lib/links";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Shopify hits "/" with ?shop=... during install — hand off to the auth flow.
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

const STATS: [string, string][] = [
  ["30%", "fewer returns"],
  ["25%", "conversion lift"],
  ["~15s", "per try-on"],
  ["1-click", "install"],
];

const STEPS: [string, string, string][] = [
  ["01", "Install the app", "Add TryOn from the Shopify App Store and enable the widget in your theme — no code."],
  ["02", "Shopper uploads a photo", "On any product page, a “Try On with AI” button opens a private, in-store fitting room."],
  ["03", "They see it on themselves", "Photoreal AI renders the garment on the shopper in seconds, then adds to cart."],
];

const FEATURES: [string, string][] = [
  ["Photoreal try-on", "Gemini-powered image generation keeps face, pose, and garment detail faithful."],
  ["Built for Shopify", "Native embed via Theme App Extension. Works on product and collection pages."],
  ["Privacy-first", "Shopper photos are processed in memory and never stored. GDPR-ready."],
  ["Conversion tracking", "See try-ons, real add-to-cart, and conversion right inside the app dashboard."],
];

function ShopifyMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 7.2 9.4 6c.2-.1.4-.1.6 0L12 7l1.8-1.6c.2-.1.4-.2.6-.1l1.9.6c.2.1.4.3.4.5l1.6 11.3c0 .3-.1.5-.4.6l-7.3 1.6a.7.7 0 0 1-.3 0L4.1 18a.6.6 0 0 1-.5-.6L5 8.3c0-.2.2-.5.5-.6L7 7.2Z"
        fill="currentColor"
      />
      <path
        d="M9.6 9.2c-.8.2-1.3.9-1.3 1.7 0 1.4 1.9 1.5 1.9 2.4 0 .3-.2.5-.6.5-.5 0-1-.3-1-.3l-.3 1s.5.4 1.3.4c.9 0 1.6-.5 1.6-1.6 0-1.5-1.9-1.6-1.9-2.4 0-.2.2-.4.5-.4.4 0 .8.2.8.2l.3-.9s-.4-.3-1.1-.3l-.2.2Z"
        fill="#fff"
      />
    </svg>
  );
}

export default function Landing() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className="tryon-landing">
      <style>{CSS}</style>

      {/* Nav */}
      <header className="nav">
        <div className="wrap nav-inner">
          <a className="brand" href="/">
            TryOn<span className="dot">.</span>
          </a>
          <a className="btn btn-primary btn-sm" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
            <ShopifyMark size={15} /> {INSTALL_CTA_LABEL}
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="wrap hero">
        <div className="tag">✨ Virtual try-on for Shopify</div>
        <h1 className="display">
          See it on <em>you</em>.<br />Before you <em>buy</em>.
        </h1>
        <p className="lede">
          Photoreal AI try-on for your Shopify store. Cut returns, lift conversion, and let shoppers
          see your products on themselves — in seconds.
        </p>

        {showForm && (
          <Form className="install" method="post" action="/auth/login">
            <input className="install-input" type="text" name="shop" placeholder="your-store.myshopify.com" />
            <button className="btn btn-primary" type="submit">Install on your store</button>
          </Form>
        )}
        <a className="store-link" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
          <ShopifyMark size={14} /> or install from the Shopify App Store →
        </a>

        <div className="stats">
          {STATS.map(([n, l]) => (
            <div className="stat" key={l}>
              <div className="stat-n">{n}</div>
              <div className="stat-l">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="wrap section">
        <div className="eyebrow">How it works</div>
        <h2 className="h2">Live on your store in minutes.</h2>
        <div className="steps">
          {STEPS.map(([n, t, d]) => (
            <div className="step" key={n}>
              <div className="step-n">{n}</div>
              <div className="step-t">{t}</div>
              <div className="step-d">{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="wrap section">
        <div className="eyebrow">Why TryOn</div>
        <h2 className="h2">Built for fashion. Built for Shopify.</h2>
        <div className="features">
          {FEATURES.map(([t, d]) => (
            <div className="feature" key={t}>
              <div className="feature-t">{t}</div>
              <div className="feature-d">{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="cta">
        <div className="wrap cta-inner">
          <h2 className="display cta-h">Turn try-ons into checkouts.</h2>
          <p className="cta-p">Free plan to get started. Install in one click — no theme code, no setup.</p>
          <a className="btn btn-on-dark" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
            <ShopifyMark size={18} /> {INSTALL_CTA_LABEL}
          </a>
        </div>
      </section>

      <footer className="wrap foot">
        <span>TryOn</span>
        <span className="foot-links">
          <a href="/privacy">Privacy</a>
          <a href={`mailto:${SUPPORT_EMAIL}`}>Support</a>
        </span>
        <span>© {new Date().getFullYear()} · Virtual try-on for Shopify</span>
      </footer>
    </div>
  );
}

const CSS = `
.tryon-landing {
  --paper: #f7f5f2; --paper-2: #efece7; --line: #e3ddd3;
  --ink: #111; --mute: #6b6b6b; --accent: #e8624a;
  background: var(--paper); color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  -webkit-font-smoothing: antialiased; line-height: 1.5;
}
.tryon-landing * { box-sizing: border-box; }
.tryon-landing a { color: inherit; text-decoration: none; }
.tryon-landing em { font-style: italic; font-family: Georgia, "Times New Roman", serif; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px; }

.nav { position: sticky; top: 0; z-index: 20; background: rgba(247,245,242,0.85);
  backdrop-filter: saturate(140%) blur(12px); border-bottom: 1px solid var(--line); }
.nav-inner { height: 64px; display: flex; align-items: center; justify-content: space-between; }
.brand { font-weight: 700; font-size: 18px; letter-spacing: -0.02em; }
.brand .dot { color: var(--accent); }

.btn { display: inline-flex; align-items: center; gap: 8px; justify-content: center;
  font-weight: 600; font-size: 15px; padding: 13px 20px; border-radius: 10px;
  border: 1px solid var(--ink); cursor: pointer; transition: all .2s; white-space: nowrap; }
.btn-sm { padding: 9px 14px; font-size: 14px; border-radius: 8px; }
.btn-primary { background: var(--ink); color: #fff; }
.btn-primary:hover { filter: brightness(1.35); }
.btn-on-dark { background: #fff; color: var(--ink); border-color: #fff; }
.btn-on-dark:hover { transform: translateY(-1px); }

.hero { padding: 80px 24px 64px; text-align: center; }
.tag { display: inline-block; font-size: 13px; color: var(--mute);
  border: 1px solid var(--line); background: #fff; padding: 6px 14px; border-radius: 999px; margin-bottom: 28px; }
.display { font-size: clamp(40px, 7vw, 76px); line-height: 1.02; letter-spacing: -0.03em; font-weight: 600; margin: 0; }
.lede { font-size: 19px; color: var(--mute); max-width: 600px; margin: 24px auto 0; }

.install { display: flex; gap: 10px; justify-content: center; margin: 36px auto 0; max-width: 520px; flex-wrap: wrap; }
.install-input { flex: 1; min-width: 240px; padding: 13px 16px; border: 1px solid var(--line);
  border-radius: 10px; font-size: 15px; background: #fff; }
.install-input:focus { outline: none; border-color: var(--ink); }
.store-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 16px; font-size: 14px; color: var(--mute); }
.store-link:hover { color: var(--ink); }

.stats { display: flex; gap: 36px; justify-content: center; flex-wrap: wrap; margin-top: 56px; }
.stat-n { font-size: 30px; font-weight: 600; letter-spacing: -0.02em; }
.stat-l { font-size: 13px; color: var(--mute); }

.section { padding: 64px 24px; }
.eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent); font-weight: 600; }
.h2 { font-size: clamp(28px, 4vw, 40px); letter-spacing: -0.02em; font-weight: 600; margin: 12px 0 40px; }

.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.step { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 28px; }
.step-n { font-family: ui-monospace, monospace; color: var(--accent); font-size: 14px; margin-bottom: 14px; }
.step-t { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
.step-d { font-size: 15px; color: var(--mute); }

.features { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.feature { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 26px; }
.feature-t { font-size: 17px; font-weight: 600; margin-bottom: 6px; }
.feature-d { font-size: 15px; color: var(--mute); }

.cta { background: var(--ink); color: var(--paper); margin-top: 40px; }
.cta-inner { padding: 88px 24px; text-align: center; }
.cta-h { color: #fff; }
.cta-p { color: #c9c4bc; font-size: 18px; margin: 20px auto 32px; max-width: 480px; }

.foot { display: flex; align-items: center; justify-content: space-between;
  padding: 28px 24px; color: var(--mute); font-size: 13px; }
.foot-links { display: flex; gap: 18px; }
.foot-links a { color: var(--mute); }
.foot-links a:hover { color: var(--ink); }

@media (max-width: 760px) {
  .steps, .features { grid-template-columns: 1fr; }
  .hero { padding: 56px 24px 48px; }
  .foot { flex-direction: column; gap: 8px; }
}
`;
