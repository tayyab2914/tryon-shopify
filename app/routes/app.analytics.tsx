import type { LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  InlineGrid,
  Select,
  InlineStack,
  Box,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { getAnalytics } from "../lib/tryon.server";
import { getShopByDomain } from "../lib/shop.server";

const PERIOD_OPTIONS = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const period = Number(url.searchParams.get("period") ?? "30");
  const periodDays = [7, 30, 90].includes(period) ? period : 30;

  const shop = await getShopByDomain(session.shop);
  if (!shop) {
    return { periodDays, analytics: null };
  }
  return { periodDays, analytics: await getAnalytics(shop.id, periodDays) };
};

export default function Analytics() {
  const { periodDays, analytics } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <Page>
      <TitleBar title="Analytics" />
      <BlockStack gap="500">
        <Form method="get">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h2" variant="headingLg">Overview</Text>
            <Box minWidth="180px">
              <Select
                label=""
                labelHidden
                options={PERIOD_OPTIONS}
                value={String(periodDays)}
                onChange={(value) => {
                  searchParams.set("period", value);
                  setSearchParams(searchParams, { preventScrollReset: true });
                }}
              />
            </Box>
          </InlineStack>
        </Form>

        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <Stat label="Try-ons" value={analytics?.tryOnTotal ?? 0} />
          <Stat label="Cart adds" value={analytics?.cartAddTotal ?? 0} />
          <Stat
            label="Orders"
            value={analytics?.orderTotal ?? 0}
            hint={`${analytics?.attributedOrderTotal ?? 0} try-on influenced`}
          />
          <Stat
            label="Revenue"
            value={formatMoney(analytics?.revenue ?? 0, analytics?.currency ?? "USD")}
          />
        </InlineGrid>

        <Card>
          <BlockStack gap="400">
            <Text as="h3" variant="headingMd">Conversion funnel</Text>
            <InlineGrid columns={{ xs: 1, sm: 5 }} gap="200">
              <FunnelStage label="Try-ons" value={analytics?.tryOnTotal ?? 0} />
              <FunnelArrow rate={analytics?.conversionRate ?? 0} caption="to cart" />
              <FunnelStage label="Cart adds" value={analytics?.cartAddTotal ?? 0} />
              <FunnelArrow rate={analytics?.orderConversionRate ?? 0} caption="to order" />
              <FunnelStage label="Orders" value={analytics?.orderTotal ?? 0} />
            </InlineGrid>
            <Text as="p" variant="bodySm" tone="subdued">
              Generation success rate {analytics?.successRate ?? 0}% · cart adds and
              order rates are relative to the previous stage. Order data needs the
              order webhook enabled and approved.
            </Text>
          </BlockStack>
        </Card>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">Daily activity</Text>
                <DailyChart daily={analytics?.daily ?? []} />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">Top products</Text>
                {(!analytics || analytics.topProducts.length === 0) && (
                  <Text as="p" tone="subdued" variant="bodyMd">
                    No try-ons yet in this window.
                  </Text>
                )}
                {analytics?.topProducts.map((p, i) => (
                  <BlockStack key={`${p.label}-${i}`} gap="100">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">{p.label}</Text>
                      <Text as="span" variant="bodyMd" fontWeight="medium">
                        {p.count}
                      </Text>
                    </InlineStack>
                    {i < (analytics?.topProducts.length ?? 0) - 1 && <Divider />}
                  </BlockStack>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

function Stat({
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
        {hint && <Text as="span" variant="bodySm" tone="subdued">{hint}</Text>}
      </BlockStack>
    </Card>
  );
}

// Minimal inline SVG bar chart — three series so we don't pull in
// recharts/polaris-viz just for the dashboard. Try-ons (light), cart-adds
// (dark), orders (green) layer on the same baseline per day.
function DailyChart({
  daily,
}: {
  daily: { date: string; label: string; tryOns: number; cartAdds: number; orders: number }[];
}) {
  if (daily.length === 0) {
    return (
      <Text as="p" tone="subdued" variant="bodyMd">
        No activity to chart yet.
      </Text>
    );
  }

  const max = Math.max(1, ...daily.map((d) => Math.max(d.tryOns, d.cartAdds, d.orders)));
  const barWidth = 100 / daily.length;

  return (
    <BlockStack gap="200">
      <svg width="100%" height="200" viewBox="0 0 100 100" preserveAspectRatio="none">
        {daily.map((d, i) => {
          const x = i * barWidth;
          const tryH = (d.tryOns / max) * 100;
          const cartH = (d.cartAdds / max) * 100;
          const ordH = (d.orders / max) * 100;
          const w = barWidth * 0.28;
          return (
            <g key={d.date}>
              <rect x={x + barWidth * 0.05} y={100 - tryH} width={w} height={tryH} fill="#8a98ff" />
              <rect x={x + barWidth * 0.36} y={100 - cartH} width={w} height={cartH} fill="#1a1a1a" />
              <rect x={x + barWidth * 0.67} y={100 - ordH} width={w} height={ordH} fill="#16a34a" />
            </g>
          );
        })}
      </svg>
      <InlineStack gap="400">
        <Legend color="#8a98ff" label="Try-ons" />
        <Legend color="#1a1a1a" label="Cart adds" />
        <Legend color="#16a34a" label="Orders" />
      </InlineStack>
      <InlineStack align="space-between">
        <Text as="span" variant="bodySm" tone="subdued">{daily[0]?.label}</Text>
        <Text as="span" variant="bodySm" tone="subdued">{daily[daily.length - 1]?.label}</Text>
      </InlineStack>
    </BlockStack>
  );
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function FunnelStage({ label, value }: { label: string; value: number }) {
  return (
    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
      <BlockStack gap="050" inlineAlign="center">
        <Text as="span" variant="headingLg">{value.toLocaleString("en-US")}</Text>
        <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
      </BlockStack>
    </Box>
  );
}

function FunnelArrow({ rate, caption }: { rate: number; caption: string }) {
  return (
    <BlockStack gap="050" inlineAlign="center">
      <Text as="span" variant="bodyMd" tone="subdued">→</Text>
      <Text as="span" variant="bodySm" fontWeight="medium">{rate}%</Text>
      <Text as="span" variant="bodySm" tone="subdued">{caption}</Text>
    </BlockStack>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <InlineStack gap="100" blockAlign="center">
      <span style={{ width: 10, height: 10, background: color, display: "inline-block" }} />
      <Text as="span" variant="bodySm">{label}</Text>
    </InlineStack>
  );
}
