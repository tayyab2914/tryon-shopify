import type { LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, Outlet, useLoaderData } from "@remix-run/react";

import { getOpsAuthState } from "../lib/ops-auth.server";

/**
 * Layout for the internal ops panel. Standalone (NOT the Shopify embedded admin):
 * plain HTML + inline CSS, no Polaris / App Bridge. The loader only reads the
 * auth state for the header — each child route enforces auth itself.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const authed = await getOpsAuthState(request);
  return { authed };
};

export default function OpsLayout() {
  const { authed } = useLoaderData<typeof loader>();

  return (
    <div className="ops-root">
      <style>{OPS_CSS}</style>
      <header className="ops-nav">
        <div className="ops-wrap ops-nav-inner">
          <Link to="/ops" className="ops-brand">
            TryOn <span className="ops-brand-tag">Ops</span>
          </Link>
          {authed && (
            <nav className="ops-nav-links">
              <Link to="/ops">Overview</Link>
              <Form method="post" action="/ops/logout">
                <button type="submit" className="ops-linkbtn">
                  Log out
                </button>
              </Form>
            </nav>
          )}
        </div>
      </header>
      <main className="ops-wrap ops-main">
        <Outlet />
      </main>
    </div>
  );
}

export const OPS_CSS = `
.ops-root {
  --bg: #f6f7f9; --panel: #ffffff; --panel-2: #f3f5f8; --line: #e4e7ec;
  --ink: #1a1d24; --mute: #697080; --accent: #4f66e4;
  --green: #16a34a; --red: #e11d48; --amber: #d97706; --blue: #2563eb; --grey: #6b7280;
  --shadow: 0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06);
  --shadow-sm: 0 1px 2px rgba(16,24,40,0.05);
  min-height: 100vh; background: var(--bg); color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.ops-root * { box-sizing: border-box; }
.ops-root a { color: inherit; text-decoration: none; }
.ops-wrap { max-width: 1240px; margin: 0 auto; padding: 0 24px; }
.ops-nav { border-bottom: 1px solid var(--line); background: rgba(255,255,255,0.85); backdrop-filter: saturate(180%) blur(8px); position: sticky; top: 0; z-index: 10; }
.ops-nav-inner { height: 58px; display: flex; align-items: center; justify-content: space-between; }
.ops-brand { font-weight: 700; font-size: 17px; letter-spacing: -0.02em; }
.ops-brand-tag { color: var(--accent); font-weight: 600; }
.ops-nav-links { display: flex; align-items: center; gap: 18px; font-size: 14px; color: var(--mute); }
.ops-nav-links a { transition: color 0.12s ease; }
.ops-nav-links a:hover { color: var(--ink); }
.ops-linkbtn { background: none; border: none; color: var(--mute); font: inherit; cursor: pointer; padding: 0; transition: color 0.12s ease; }
.ops-linkbtn:hover { color: var(--ink); }
.ops-main { padding: 28px 24px 64px; }

.ops-h1 { font-size: 26px; font-weight: 650; letter-spacing: -0.02em; margin: 0 0 4px; }
.ops-sub { color: var(--mute); font-size: 14px; margin: 0 0 24px; }
.ops-sub a { color: var(--accent); }
.ops-sub a:hover { text-decoration: underline; }

.ops-kpis { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); margin-bottom: 14px; }
.ops-kpi { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; box-shadow: var(--shadow-sm); transition: box-shadow 0.15s ease, border-color 0.15s ease; }
.ops-kpi:hover { box-shadow: var(--shadow); border-color: #d7dbe3; }
.ops-kpi-label { font-size: 12px; color: var(--mute); text-transform: uppercase; letter-spacing: 0.06em; }
.ops-kpi-value { font-size: 24px; font-weight: 650; margin-top: 6px; letter-spacing: -0.02em; }
.ops-kpi-hint { font-size: 12px; color: var(--mute); margin-top: 2px; }
.ops-kpi-accent .ops-kpi-value { color: var(--accent); }

.ops-section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mute); margin: 22px 0 10px; font-weight: 600; }

.ops-card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; box-shadow: var(--shadow-sm); }
.ops-card + .ops-card { margin-top: 14px; }

.ops-tablewrap { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; overflow: auto; box-shadow: var(--shadow-sm); }
table.ops-table { width: 100%; border-collapse: collapse; font-size: 13.5px; white-space: nowrap; }
.ops-table th { text-align: left; font-weight: 600; color: var(--mute); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 14px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--panel-2); }
.ops-table td { padding: 12px 14px; border-bottom: 1px solid var(--line); }
.ops-table tr:last-child td { border-bottom: none; }
.ops-table tbody tr { transition: background 0.1s ease; }
.ops-table tbody tr:hover { background: var(--panel-2); }
.ops-table td.ops-num { text-align: right; font-variant-numeric: tabular-nums; }
.ops-store { font-weight: 600; }
.ops-store a:hover .ops-store, .ops-table a:hover .ops-store { color: var(--accent); }
.ops-store-domain { color: var(--mute); font-size: 12px; }

.ops-badge { display: inline-block; font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px; border: 1px solid transparent; }
.ops-badge-paid { background: #e7f6ee; color: #0f7a3d; border-color: #c4e8d3; }
.ops-badge-unpaid { background: #fdeaee; color: #c01a34; border-color: #f6cdd5; }
.ops-badge-free { background: #e8f0fe; color: #1d4ed8; border-color: #ccdcfb; }
.ops-badge-custom { background: #f2eafe; color: #7c3aed; border-color: #e0cffb; }
.ops-badge-uninstalled { background: #eef0f3; color: #5b6472; border-color: #dfe3ea; }
.ops-badge-active { background: #e7f6ee; color: #0f7a3d; border-color: #c4e8d3; }
.ops-badge-idle { background: #fdf1dd; color: #b45309; border-color: #f5e0b8; }
.ops-badge-test { background: #fdf1dd; color: #b45309; border-color: #f5e0b8; margin-left: 6px; }

.ops-stale { color: var(--amber); font-size: 12px; }
.ops-empty { color: var(--mute); padding: 40px; text-align: center; }
.ops-warn { background: #fef6e7; border: 1px solid #f5e0b8; color: #92500a; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }

.ops-login { max-width: 380px; margin: 80px auto; background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 30px; box-shadow: var(--shadow); }
.ops-login h1 { font-size: 20px; margin: 0 0 6px; }
.ops-login p { color: var(--mute); font-size: 13.5px; margin: 0 0 20px; }
.ops-field { display: block; width: 100%; padding: 11px 13px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; color: var(--ink); font-size: 15px; transition: border-color 0.12s ease, box-shadow 0.12s ease; }
.ops-field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,102,228,0.15); }
.ops-btn { display: inline-block; width: 100%; margin-top: 14px; padding: 11px 16px; background: var(--accent); color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.12s ease; }
.ops-btn:hover { background: #4054cf; }
.ops-error { background: #fdeaee; border: 1px solid #f6cdd5; color: #b0182f; border-radius: 10px; padding: 9px 12px; font-size: 13px; margin-bottom: 16px; }
.ops-login code { background: var(--panel-2); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; font-size: 12px; }

.ops-back { color: var(--mute); font-size: 13px; transition: color 0.12s ease; }
.ops-back:hover { color: var(--accent); }
.ops-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.ops-dl { display: grid; grid-template-columns: 140px 1fr; gap: 8px 14px; font-size: 13.5px; }
.ops-dl dt { color: var(--mute); }
.ops-dl dd { margin: 0; }
.ops-period { display: inline-flex; gap: 6px; }
.ops-period a { font-size: 13px; padding: 5px 11px; border: 1px solid var(--line); border-radius: 8px; color: var(--mute); background: var(--panel); transition: all 0.12s ease; }
.ops-period a:hover { border-color: #d7dbe3; color: var(--ink); }
.ops-period a.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.ops-funnel { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ops-funnel-stage { background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; padding: 10px 16px; text-align: center; min-width: 92px; }
.ops-funnel-n { font-size: 20px; font-weight: 650; }
.ops-funnel-l { font-size: 11.5px; color: var(--mute); }
.ops-funnel-arrow { color: var(--mute); font-size: 12px; text-align: center; }
@media (max-width: 720px) { .ops-grid2 { grid-template-columns: 1fr; } }
`;
