import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  InlineGrid,
  Banner,
  Button,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getAnalytics } from "../lib/tryon.server";
import { getShopByDomain } from "../lib/shop.server";
import { getPlanStatus, type PlanStatus } from "../lib/billing.server";
import { SUPPORT_EMAIL } from "../lib/links";

interface TryOnSummary {
  id: string;
  garment: string | null;
  productHandle: string | null;
  status: string;
  createdAt: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  let widgetEnabled = false;
  let analytics: Awaited<ReturnType<typeof getAnalytics>> | null = null;
  let recentTryOns: TryOnSummary[] = [];
  let planStatus: PlanStatus | null = null;

  if (shop) {
    widgetEnabled = shop.widgetEnabled;
    const [a, rows, plan] = await Promise.all([
      getAnalytics(shop.id, 30),
      db.tryOn.findMany({
        where: { shopId: shop.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          garment: true,
          productHandle: true,
          status: true,
          createdAt: true,
        },
      }),
      getPlanStatus(shop.id, shop.plan, shop.chargeId),
    ]);
    analytics = a;
    planStatus = plan;
    recentTryOns = rows.map((t) => ({
      id: t.id,
      garment: t.garment,
      productHandle: t.productHandle,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  return { shopDomain: session.shop, widgetEnabled, analytics, recentTryOns, planStatus };
};

export default function Index() {
  const { shopDomain, widgetEnabled, analytics, recentTryOns, planStatus } =
    useLoaderData<typeof loader>();

  const themeEditorUrl = `https://${shopDomain}/admin/themes/current/editor?context=apps`;

  return (
    <Page>
      <TitleBar title="TryOn dashboard" />
      <BlockStack gap="500">
        {planStatus?.needsPayment && (
          <Banner
            title="Subscribe to start serving try-ons"
            tone="warning"
            action={{ content: "Choose a plan", url: "/app/billing" }}
          >
            <p>
              Your {planStatus.planName} plan isn&rsquo;t active yet. Subscribe
              from Billing to turn on the widget for your shoppers.
            </p>
          </Banner>
        )}
        {planStatus?.overQuota && !planStatus.needsPayment && (
          <Banner
            title="You've reached this month's try-on limit"
            tone="warning"
            action={{ content: "Upgrade plan", url: "/app/billing" }}
          >
            <p>
              Try-ons are paused for your shoppers until your quota resets on the
              1st. Upgrade for a higher monthly allowance.
            </p>
          </Banner>
        )}
        {!widgetEnabled && (
          <Banner
            title="Widget is turned off"
            tone="warning"
            action={{ content: "Open Settings", url: "/app/settings" }}
          >
            <p>Turn it on from Settings to start serving try-ons.</p>
          </Banner>
        )}

        <Banner
          title="Enable the TryOn app embed in your theme"
          tone="info"
          action={{
            content: "Open theme editor",
            url: themeEditorUrl,
            external: true,
          }}
        >
          <p>
            Once enabled, the Try On button appears on every product page on
            your storefront.
          </p>
        </Banner>

        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              <StatCard label="Try-ons (30d)" value={analytics?.tryOnTotal ?? 0} />
              <StatCard label="Cart adds (30d)" value={analytics?.cartAddTotal ?? 0} />
              <StatCard
                label="Orders (30d)"
                value={analytics?.orderTotal ?? 0}
                hint={`${analytics?.attributedOrderTotal ?? 0} try-on influenced`}
              />
              <StatCard
                label="Revenue (30d)"
                value={formatMoney(analytics?.revenue ?? 0, analytics?.currency ?? "USD")}
              />
            </InlineGrid>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Recent try-ons</Text>
                  <Link to="/app/analytics">
                    <Text as="span" variant="bodySm" tone="subdued">
                      View all →
                    </Text>
                  </Link>
                </InlineStack>
                {recentTryOns.length === 0 ? (
                  <Text as="p" tone="subdued" variant="bodyMd">
                    No try-ons yet. Once a shopper uses the widget, they show up
                    here.
                  </Text>
                ) : (
                  <BlockStack gap="200">
                    {recentTryOns.map((t) => (
                      <InlineStack
                        key={t.id}
                        align="space-between"
                        blockAlign="center"
                      >
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="medium">
                            {t.garment || "Virtual try-on"}
                          </Text>
                          {t.productHandle && (
                            <Text as="span" variant="bodySm" tone="subdued">
                              {t.productHandle}
                            </Text>
                          )}
                        </BlockStack>
                        <InlineStack gap="300" blockAlign="center">
                          <StatusBadge status={t.status} />
                          <Text as="span" variant="bodySm" tone="subdued">
                            {formatWhen(t.createdAt)}
                          </Text>
                        </InlineStack>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            {planStatus && (
              <Card>
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Plan</Text>
                    <Badge tone={planStatus.active ? "success" : "attention"}>
                      {planStatus.planName}
                    </Badge>
                  </InlineStack>
                  <Text as="p" variant="bodyMd">
                    {planStatus.unlimited
                      ? `${planStatus.used} try-ons this month · unlimited`
                      : `${planStatus.used} / ${planStatus.quota ?? 0} try-ons this month`}
                  </Text>
                  <Button url="/app/billing">Manage plan</Button>
                </BlockStack>
              </Card>
            )}
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Quick actions</Text>
                <Button url="/app/customization">Customize the widget</Button>
                <Button url="/app/analytics">View analytics</Button>
                <Button url={themeEditorUrl} target="_blank" variant="plain">
                  Open theme editor
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Help &amp; support</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Questions or issues? We&rsquo;re happy to help.
                </Text>
                <Button url={`mailto:${SUPPORT_EMAIL}`} external>
                  Email support
                </Button>
                <Button url="/privacy" target="_blank" variant="plain">
                  Privacy policy
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
        <Text as="p" variant="heading2xl">{value}</Text>
        {hint && (
          <Text as="span" variant="bodySm" tone="subdued">{hint}</Text>
        )}
      </BlockStack>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED") return <Badge tone="success">Done</Badge>;
  if (status === "FAILED") return <Badge tone="critical">Failed</Badge>;
  return <Badge>{status}</Badge>;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatWhen(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
