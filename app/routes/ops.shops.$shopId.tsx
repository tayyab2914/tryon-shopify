import { Fragment } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

import { requireOps } from "../lib/ops-auth.server";
import { getOpsShopDetail } from "../lib/ops.server";
import { num, money, date, relative } from "./ops._index";

const PERIODS = [7, 30, 90];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireOps(request);
  const url = new URL(request.url);
  const p = Number(url.searchParams.get("period") ?? "30");
  const periodDays = PERIODS.includes(p) ? p : 30;

  const detail = await getOpsShopDetail(params.shopId ?? "", periodDays);
  if (!detail) throw new Response("Store not found", { status: 404 });
  return { detail, periodDays };
};

export default function OpsShopDetail() {
  const { detail, periodDays } = useLoaderData<typeof loader>();
  const a = detail.analytics;
  const sub = detail.subscription;
  const p = detail.profile;
  const name = p?.name || detail.shopDomain.replace(/\.myshopify\.com$/, "");

  return (
    <>
      <Link to="/ops" className="ops-back">
        ← All stores
      </Link>
      <div style={{ height: 14 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 className="ops-h1" style={{ margin: 0 }}>
          {name}
        </h1>
        <span className={`ops-badge ${paymentClass(detail.payment)}`}>{cap(detail.payment)}</span>
        {detail.uninstalledAt && <span className="ops-badge ops-badge-uninstalled">Uninstalled</span>}
      </div>
      <p className="ops-sub">
        <a href={`https://${detail.shopDomain}/admin`} target="_blank" rel="noopener noreferrer">
          {detail.shopDomain} ↗
        </a>
      </p>

      <div className="ops-grid2">
        {/* Subscription (live from Shopify) */}
        <div className="ops-card">
          <div className="ops-section-title" style={{ marginTop: 0 }}>
            Subscription (live)
          </div>
          {detail.billingReason ? (
            <p className="ops-sub" style={{ margin: 0 }}>
              {detail.billingReason === "uninstalled"
                ? "Store is uninstalled — no live billing."
                : `Couldn't read Shopify billing: ${detail.billingReason}`}
            </p>
          ) : sub ? (
            <dl className="ops-dl">
              <dt>Plan</dt>
              <dd>
                {sub.name} {sub.test && <span className="ops-badge ops-badge-test">test</span>}
              </dd>
              <dt>Status</dt>
              <dd>{cap(sub.status)}</dd>
              <dt>Price</dt>
              <dd>
                {money(sub.amount, sub.currencyCode)}
                {sub.interval ? ` / ${sub.interval === "EVERY_30_DAYS" ? "mo" : sub.interval.toLowerCase()}` : ""}
              </dd>
              {sub.currentPeriodEnd && (
                <>
                  <dt>Renews</dt>
                  <dd>{date(sub.currentPeriodEnd)}</dd>
                </>
              )}
              {sub.trialDays ? (
                <>
                  <dt>Trial</dt>
                  <dd>{sub.trialDays} days</dd>
                </>
              ) : null}
              <dt>Started</dt>
              <dd>{sub.createdAt ? date(sub.createdAt) : "—"}</dd>
            </dl>
          ) : (
            <p className="ops-sub" style={{ margin: 0 }}>
              No active Shopify subscription.
            </p>
          )}
        </div>

        {/* Store profile (live from Shopify) */}
        <div className="ops-card">
          <div className="ops-section-title" style={{ marginTop: 0 }}>
            Store profile (live)
          </div>
          {p ? (
            <dl className="ops-dl">
              <dt>Name</dt>
              <dd>{p.name || "—"}</dd>
              <dt>Contact</dt>
              <dd>{p.contactEmail || p.email || detail.contact?.email || "—"}</dd>
              <dt>Country</dt>
              <dd>{p.country || "—"}</dd>
              <dt>Currency</dt>
              <dd>{p.currencyCode || "—"}</dd>
              <dt>Shopify plan</dt>
              <dd>
                {p.shopifyPlan || "—"} {p.devStore && <span className="ops-badge ops-badge-idle">dev</span>}
              </dd>
              <dt>Created</dt>
              <dd>{p.createdAt ? date(p.createdAt) : "—"}</dd>
            </dl>
          ) : (
            <p className="ops-sub" style={{ margin: 0 }}>
              {detail.profileReason ? `Profile unavailable: ${detail.profileReason}` : "No profile data."}
            </p>
          )}
        </div>
      </div>

      {/* Period selector */}
      <div className="ops-section-title">Analytics</div>
      <div className="ops-period" style={{ marginBottom: 14 }}>
        {PERIODS.map((d) => (
          <Link key={d} to={`?period=${d}`} className={d === periodDays ? "active" : ""}>
            {d}d
          </Link>
        ))}
      </div>

      <div className="ops-kpis">
        <MiniKpi label={`Try-ons (${periodDays}d)`} value={num(a.tryOnTotal)} />
        <MiniKpi label="Cart adds" value={num(a.cartAddTotal)} />
        <MiniKpi label="Orders (tracked)" value={num(a.orderTotal)} hint={`${num(a.attributedOrderTotal)} try-on influenced`} />
        <MiniKpi label="Revenue (tracked)" value={money(a.revenue, a.currency)} />
        <MiniKpi
          label={`Orders (Shopify ${detail.sales?.days ?? periodDays}d)`}
          value={detail.sales ? num(detail.sales.orderCount) : "—"}
        />
        <MiniKpi
          label="Sales (Shopify, live)"
          value={detail.sales ? money(detail.sales.totalSales, detail.sales.currency) : "—"}
          hint={detail.salesReason ? detail.salesReason : detail.sales?.capped ? "capped" : undefined}
        />
      </div>

      {/* Funnel */}
      <div className="ops-card">
        <div className="ops-section-title" style={{ marginTop: 0 }}>
          Conversion funnel
        </div>
        <div className="ops-funnel">
          <FunnelStage n={a.tryOnTotal} label="Try-ons" />
          <FunnelArrow rate={a.conversionRate} caption="to cart" />
          <FunnelStage n={a.cartAddTotal} label="Cart adds" />
          <FunnelArrow rate={a.orderConversionRate} caption="to order" />
          <FunnelStage n={a.orderTotal} label="Orders" />
        </div>
        <p className="ops-sub" style={{ margin: "12px 0 0" }}>
          Generation success rate {a.successRate}% · {num(a.completed)} completed / {num(a.failed)} failed.
        </p>
      </div>

      <div className="ops-grid2" style={{ marginTop: 14 }}>
        <div className="ops-card">
          <div className="ops-section-title" style={{ marginTop: 0 }}>
            Daily activity
          </div>
          <DailyChart daily={a.daily} />
        </div>
        <div className="ops-card">
          <div className="ops-section-title" style={{ marginTop: 0 }}>
            Top products
          </div>
          {a.topProducts.length === 0 ? (
            <p className="ops-sub" style={{ margin: 0 }}>
              No try-ons in this window.
            </p>
          ) : (
            <dl className="ops-dl" style={{ gridTemplateColumns: "1fr auto" }}>
              {a.topProducts.map((tp, i) => (
                <Fragment key={`${tp.label}-${i}`}>
                  <dt style={{ color: "var(--ink)" }}>{tp.label}</dt>
                  <dd style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(tp.count)}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </div>
      </div>

      {/* Config + recent */}
      <div className="ops-grid2" style={{ marginTop: 14 }}>
        <div className="ops-card">
          <div className="ops-section-title" style={{ marginTop: 0 }}>
            Install &amp; widget
          </div>
          <dl className="ops-dl">
            <dt>Installed</dt>
            <dd>{date(detail.installedAt)}</dd>
            <dt>Uninstalled</dt>
            <dd>{detail.uninstalledAt ? date(detail.uninstalledAt) : "—"}</dd>
            <dt>Widget</dt>
            <dd>{detail.widgetEnabled ? "Enabled" : "Disabled"}</dd>
            <dt>Pixel</dt>
            <dd>{detail.pixelActivated ? "Activated" : "—"}</dd>
            <dt>Rate limit</dt>
            <dd>
              {detail.tryOnLimitEnabled
                ? `${detail.tryOnLimitPerIp} / ${detail.tryOnLimitPeriod.toLowerCase()}`
                : "Off"}
            </dd>
            <dt>Plan quota</dt>
            <dd>
              {detail.planStatus.used} used ·{" "}
              {detail.planStatus.unlimited ? "unlimited" : `${detail.planStatus.quota ?? 0} / mo`}
              {detail.planStatus.needsPayment ? " · needs payment" : ""}
            </dd>
          </dl>
        </div>

        <div className="ops-card">
          <div className="ops-section-title" style={{ marginTop: 0 }}>
            Recent try-ons
          </div>
          {detail.recentTryOns.length === 0 ? (
            <p className="ops-sub" style={{ margin: 0 }}>
              None yet.
            </p>
          ) : (
            <table className="ops-table" style={{ whiteSpace: "normal" }}>
              <tbody>
                {detail.recentTryOns.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.garment || "Virtual try-on"}
                      {t.productHandle && <div className="ops-store-domain">{t.productHandle}</div>}
                    </td>
                    <td>
                      <span
                        className={`ops-badge ${
                          t.status === "COMPLETED"
                            ? "ops-badge-paid"
                            : t.status === "FAILED"
                              ? "ops-badge-unpaid"
                              : "ops-badge-idle"
                        }`}
                      >
                        {cap(t.status)}
                      </span>
                    </td>
                    <td className="ops-num">{relative(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function MiniKpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="ops-kpi">
      <div className="ops-kpi-label">{label}</div>
      <div className="ops-kpi-value">{value}</div>
      {hint && <div className="ops-kpi-hint">{hint}</div>}
    </div>
  );
}

function FunnelStage({ n, label }: { n: number; label: string }) {
  return (
    <div className="ops-funnel-stage">
      <div className="ops-funnel-n">{num(n)}</div>
      <div className="ops-funnel-l">{label}</div>
    </div>
  );
}

function FunnelArrow({ rate, caption }: { rate: number; caption: string }) {
  return (
    <div className="ops-funnel-arrow">
      <div>→</div>
      <div style={{ fontWeight: 600, color: "var(--ink)" }}>{rate}%</div>
      <div>{caption}</div>
    </div>
  );
}

function DailyChart({
  daily,
}: {
  daily: { date: string; label: string; tryOns: number; cartAdds: number; orders: number }[];
}) {
  if (daily.length === 0) {
    return (
      <p className="ops-sub" style={{ margin: 0 }}>
        No activity to chart yet.
      </p>
    );
  }
  const max = Math.max(1, ...daily.map((d) => Math.max(d.tryOns, d.cartAdds, d.orders)));
  const barWidth = 100 / daily.length;
  return (
    <>
      <svg width="100%" height="160" viewBox="0 0 100 100" preserveAspectRatio="none">
        {daily.map((d, i) => {
          const x = i * barWidth;
          const w = barWidth * 0.28;
          return (
            <g key={d.date}>
              <rect x={x + barWidth * 0.05} y={100 - (d.tryOns / max) * 100} width={w} height={(d.tryOns / max) * 100} fill="#4f66e4" />
              <rect x={x + barWidth * 0.36} y={100 - (d.cartAdds / max) * 100} width={w} height={(d.cartAdds / max) * 100} fill="#94a0b3" />
              <rect x={x + barWidth * 0.67} y={100 - (d.orders / max) * 100} width={w} height={(d.orders / max) * 100} fill="#16a34a" />
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "var(--mute)" }}>
        <Legend color="#4f66e4" label="Try-ons" />
        <Legend color="#94a0b3" label="Cart adds" />
        <Legend color="#16a34a" label="Orders" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12, color: "var(--mute)" }}>
        <span>{daily[0]?.label}</span>
        <span>{daily[daily.length - 1]?.label}</span>
      </div>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, background: color, display: "inline-block", borderRadius: 2 }} />
      {label}
    </span>
  );
}

function cap(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function paymentClass(payment: string): string {
  switch (payment) {
    case "PAID":
      return "ops-badge-paid";
    case "UNPAID":
      return "ops-badge-unpaid";
    case "FREE":
      return "ops-badge-free";
    case "CUSTOM":
      return "ops-badge-custom";
    default:
      return "ops-badge-uninstalled";
  }
}
