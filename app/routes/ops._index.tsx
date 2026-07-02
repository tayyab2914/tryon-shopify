import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

import { requireOps } from "../lib/ops-auth.server";
import { getOpsOverview, type PaymentStatus, type StoreState } from "../lib/ops.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireOps(request);
  return getOpsOverview();
};

export default function OpsOverview() {
  const { kpis, rows, generatedAt } = useLoaderData<typeof loader>();

  return (
    <>
      <h1 className="ops-h1">Store monitoring</h1>
      <p className="ops-sub">
        Every store that ever installed TryOn · live from Shopify · updated{" "}
        {new Date(generatedAt).toLocaleString()}
      </p>

      {kpis.syncFailures > 0 && (
        <div className="ops-warn">
          {kpis.syncFailures} store{kpis.syncFailures === 1 ? "" : "s"} couldn&rsquo;t be reached on
          Shopify — showing last-known values from the database for those rows.
        </div>
      )}

      <div className="ops-section-title">Billing</div>
      <div className="ops-kpis">
        <Kpi label="Total stores" value={kpis.totalStores} />
        <Kpi label="Active installs" value={kpis.activeInstalls} />
        <Kpi label="Paid" value={kpis.paid} accent />
        <Kpi label="Unpaid" value={kpis.unpaid} />
        <Kpi label="Free" value={kpis.free} />
        <Kpi label="Custom" value={kpis.custom} />
        <Kpi label="Uninstalled" value={kpis.uninstalled} />
        <Kpi
          label="MRR"
          value={money(kpis.mrr, kpis.mrrCurrency)}
          accent
          hint={kpis.mrrMixedCurrency ? `${kpis.mrrCurrency} only · other currencies excluded` : "active paid subs"}
        />
      </div>

      <div className="ops-section-title">Usage &amp; orders</div>
      <div className="ops-kpis">
        <Kpi label="Try-ons this month" value={num(kpis.tryOnsThisMonth)} />
        <Kpi label="Try-ons (lifetime)" value={num(kpis.lifetimeTryOns)} />
        <Kpi label="Cart adds (lifetime)" value={num(kpis.lifetimeCartAdds)} />
        <Kpi label="Orders (tracked)" value={num(kpis.lifetimeOrders)} />
        <Kpi
          label="Orders 30d (Shopify)"
          value={num(kpis.orders30dLive)}
          hint={
            kpis.orders30dMissing > 0
              ? `excludes ${kpis.orders30dMissing} store${kpis.orders30dMissing === 1 ? "" : "s"} not reporting`
              : undefined
          }
        />
        <Kpi
          label="Revenue (tracked)"
          value={money(kpis.localRevenue, kpis.localRevenueCurrency)}
          hint={kpis.localRevenueMixedCurrency ? `${kpis.localRevenueCurrency} only · other currencies excluded` : undefined}
        />
      </div>

      <div className="ops-section-title">All stores ({rows.length})</div>
      {rows.length === 0 ? (
        <div className="ops-tablewrap">
          <div className="ops-empty">No stores yet. Once a merchant installs the app, they appear here.</div>
        </div>
      ) : (
        <div className="ops-tablewrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Contact</th>
                <th>State</th>
                <th>Payment</th>
                <th>Plan</th>
                <th className="ops-num">Usage (mo)</th>
                <th className="ops-num">Try-ons</th>
                <th className="ops-num">Orders 30d</th>
                <th>Installed</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.shopId}>
                  <td>
                    <Link to={`/ops/shops/${r.shopId}`}>
                      <div className="ops-store">{r.storeName || r.shopDomain.replace(/\.myshopify\.com$/, "")}</div>
                      <div className="ops-store-domain">{r.shopDomain}</div>
                    </Link>
                  </td>
                  <td>{r.contactEmail || <span className="ops-store-domain">—</span>}</td>
                  <td>
                    <StateBadge state={r.state} />
                    {r.syncState === "stale" && (
                      <span className="ops-stale" title={r.syncReason ?? "Shopify unreachable"}>
                        {" "}⚠
                      </span>
                    )}
                  </td>
                  <td>
                    <PaymentBadge payment={r.payment} status={r.subscriptionStatus} />
                    {r.isTest && <span className="ops-badge ops-badge-test">test</span>}
                  </td>
                  <td>
                    {r.planName}
                    {r.payment !== "FREE" && r.payment !== "UNINSTALLED" && r.priceAmount > 0 && (
                      <span className="ops-store-domain"> · {money(r.priceAmount, r.priceCurrency)}/mo</span>
                    )}
                  </td>
                  <td className="ops-num">
                    {num(r.usedThisMonth)}
                    {r.quota != null ? ` / ${num(r.quota)}` : " / ∞"}
                  </td>
                  <td className="ops-num">{num(r.lifetimeTryOns)}</td>
                  <td className="ops-num">{r.orders30d == null ? "—" : num(r.orders30d)}</td>
                  <td>{date(r.installedAt)}</td>
                  <td>{r.lastActivityAt ? relative(r.lastActivityAt) : <span className="ops-store-domain">never</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`ops-kpi${accent ? " ops-kpi-accent" : ""}`}>
      <div className="ops-kpi-label">{label}</div>
      <div className="ops-kpi-value">{value}</div>
      {hint && <div className="ops-kpi-hint">{hint}</div>}
    </div>
  );
}

const STATE_LABEL: Record<StoreState, string> = {
  ACTIVE: "Active",
  IDLE: "Idle",
  UNINSTALLED: "Uninstalled",
};

function StateBadge({ state }: { state: StoreState }) {
  const cls =
    state === "ACTIVE" ? "ops-badge-active" : state === "IDLE" ? "ops-badge-idle" : "ops-badge-uninstalled";
  return <span className={`ops-badge ${cls}`}>{STATE_LABEL[state]}</span>;
}

function PaymentBadge({ payment, status }: { payment: PaymentStatus; status: string | null }) {
  const map: Record<PaymentStatus, string> = {
    PAID: "ops-badge-paid",
    UNPAID: "ops-badge-unpaid",
    FREE: "ops-badge-free",
    CUSTOM: "ops-badge-custom",
    UNINSTALLED: "ops-badge-uninstalled",
  };
  const label =
    payment === "UNPAID" && status && status !== "ACTIVE"
      ? status.charAt(0) + status.slice(1).toLowerCase()
      : payment.charAt(0) + payment.slice(1).toLowerCase();
  return <span className={`ops-badge ${map[payment]}`}>{label}</span>;
}

// ─── formatting ──────────────────────────────────────────────────────────────

export function num(n: number): string {
  return n.toLocaleString("en-US");
}

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function date(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function relative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return date(iso);
}
