import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineGrid,
  InlineStack,
  Text,
  Badge,
  Button,
  Banner,
  ProgressBar,
  Box,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { getShopByDomain } from "../lib/shop.server";
import {
  BILLING_TEST,
  FREE_PLAN_OPEN,
  getPlanStatus,
  syncShopPlan,
  type PlanStatus,
} from "../lib/billing.server";
import {
  BILLABLE_PLAN_IDS,
  PLANS,
  PLAN_ORDER,
  isBillablePlanId,
  normalizePlan,
  planKeyFromName,
} from "../lib/plans";
import { SUPPORT_EMAIL } from "../lib/links";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  const base = {
    billingTest: BILLING_TEST,
    freePlanOpen: FREE_PLAN_OPEN,
    supportEmail: SUPPORT_EMAIL,
  };

  if (!shop) {
    // app.tsx upserts the shop on every admin request, so this is defensive
    // only — never crash the billing page on a missing row.
    return { ...base, status: null as PlanStatus | null, checkFailed: false };
  }

  // Ask Shopify what the merchant is actually subscribed to, then sync our DB
  // so the storefront quota gate (which trusts the DB) stays accurate.
  let active: { id: string; name: string } | null = null;
  let checkFailed = false;
  try {
    const check = await billing.check({
      plans: [...BILLABLE_PLAN_IDS],
      isTest: BILLING_TEST,
    });
    const sub = check.appSubscriptions[0];
    active = sub ? { id: sub.id, name: sub.name } : null;
  } catch (err) {
    console.error("billing.check failed", err);
    checkFailed = true;
  }

  let planKey = normalizePlan(shop.plan);
  let chargeId = shop.chargeId;
  if (!checkFailed) {
    const synced = await syncShopPlan(session.shop, active);
    planKey = synced.plan;
    chargeId = synced.chargeId;
  }

  const status = await getPlanStatus(shop.id, planKey, chargeId);
  return { ...base, status, checkFailed };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin, billing } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "subscribe") {
    const plan = String(form.get("plan") ?? "");
    if (!isBillablePlanId(plan)) {
      return json({ error: "Unknown plan." }, { status: 400 });
    }
    const def = PLANS[planKeyFromName(plan)!];

    // Build an ABSOLUTE return URL. The old code used
    // `${process.env.SHOPIFY_APP_URL ?? ""}/app/billing`, which silently becomes
    // a RELATIVE url when the env var is unset — Shopify then rejects the charge.
    // Fall back to the request origin so the URL is always valid.
    const origin = (process.env.SHOPIFY_APP_URL || new URL(request.url).origin)
      .replace(/\/+$/, "");
    const returnUrl = `${origin}/app/billing`;

    // Create the recurring charge directly so we get the confirmationUrl back as
    // DATA (rather than the library throwing a cross-origin redirect that the
    // embedded iframe's fetch can't follow — the cause of the "app error" on
    // upgrade). The client then redirects the top frame to this URL.
    try {
      const response = await admin.graphql(
        `#graphql
        mutation CreateAppSubscription(
          $name: String!
          $returnUrl: URL!
          $test: Boolean!
          $lineItems: [AppSubscriptionLineItemInput!]!
        ) {
          appSubscriptionCreate(
            name: $name
            returnUrl: $returnUrl
            test: $test
            lineItems: $lineItems
          ) {
            userErrors { field message }
            confirmationUrl
            appSubscription { id }
          }
        }`,
        {
          variables: {
            name: plan,
            returnUrl,
            test: BILLING_TEST,
            lineItems: [
              {
                plan: {
                  appRecurringPricingDetails: {
                    price: { amount: def.amount, currencyCode: "USD" },
                    interval: "EVERY_30_DAYS",
                  },
                },
              },
            ],
          },
        },
      );

      const body = (await response.json()) as {
        data?: {
          appSubscriptionCreate?: {
            userErrors?: Array<{ field?: string[] | null; message: string }>;
            confirmationUrl?: string | null;
          };
        };
      };
      const result = body.data?.appSubscriptionCreate;

      if (result?.userErrors?.length) {
        console.error("appSubscriptionCreate userErrors", result.userErrors);
        return json(
          { error: result.userErrors[0].message || "Couldn't start the subscription." },
          { status: 422 },
        );
      }
      if (!result?.confirmationUrl) {
        return json(
          { error: "Shopify didn't return an approval URL. Please try again." },
          { status: 502 },
        );
      }

      return json({ confirmationUrl: result.confirmationUrl });
    } catch (err) {
      console.error("appSubscriptionCreate failed", err);
      return json(
        { error: "Couldn't reach Shopify billing. Please try again." },
        { status: 500 },
      );
    }
  }

  if (intent === "cancel") {
    try {
      const check = await billing.check({
        plans: [...BILLABLE_PLAN_IDS],
        isTest: BILLING_TEST,
      });
      const sub = check.appSubscriptions[0];
      if (sub) {
        await billing.cancel({
          subscriptionId: sub.id,
          isTest: BILLING_TEST,
          prorate: true,
        });
      }
    } catch (err) {
      console.error("billing.cancel failed", err);
    }
    await syncShopPlan(session.shop, null);
    return redirect("/app/billing");
  }

  return redirect("/app/billing");
};

function priceLabel(amount: number, key: string): string {
  if (key === "CUSTOM") return "Custom";
  if (amount <= 0) return "Free";
  return `$${amount.toFixed(2)}/mo`;
}

function quotaLabel(key: string): string {
  const q = PLANS[key as keyof typeof PLANS].quota;
  if (!Number.isFinite(q)) return "Unlimited try-ons";
  return `${q.toLocaleString("en-US")} try-ons / month`;
}

export default function Billing() {
  const { status, checkFailed, billingTest, freePlanOpen, supportEmail } =
    useLoaderData<typeof loader>();

  const currentKey = status?.plan ?? "FREE";
  const currentAmount = PLANS[currentKey].amount;

  return (
    <Page>
      <TitleBar title="Billing" />
      <BlockStack gap="500">
        {billingTest && (
          <Banner tone="info" title="Test billing is on">
            <p>
              Subscriptions are created in Shopify&rsquo;s test mode, so no real
              charge is made. Set <code>SHOPIFY_BILLING_TEST=false</code> to bill
              for real.
            </p>
          </Banner>
        )}

        {checkFailed && (
          <Banner tone="warning" title="Couldn&rsquo;t reach Shopify billing">
            <p>
              We&rsquo;re showing your last known plan. Reload in a moment to
              refresh subscription status.
            </p>
          </Banner>
        )}

        {status && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Current plan
                    </Text>
                    <Badge tone={status.active ? "success" : "attention"}>
                      {status.planName}
                    </Badge>
                  </InlineStack>

                  <Text as="p" variant="bodyMd" tone="subdued">
                    {priceLabel(status.amount, status.plan)} ·{" "}
                    {PLANS[status.plan].blurb}
                  </Text>

                  {status.needsPayment ? (
                    <Banner tone="warning" title="This plan isn't active yet">
                      <p>
                        Subscribe to {status.planName} to start serving try-ons
                        on your storefront.
                      </p>
                      <Box paddingBlockStart="200">
                        <SubscribeButton plan={status.planName} label={`Subscribe to ${status.planName}`} variant="primary" />
                      </Box>
                    </Banner>
                  ) : status.unlimited ? (
                    <Text as="p" variant="bodyMd">
                      Unlimited try-ons this month · {status.used.toLocaleString("en-US")} used.
                    </Text>
                  ) : (
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodyMd">
                          Try-ons this month
                        </Text>
                        <Text as="span" variant="bodyMd" fontWeight="medium">
                          {status.used.toLocaleString("en-US")} /{" "}
                          {(status.quota ?? 0).toLocaleString("en-US")}
                        </Text>
                      </InlineStack>
                      <ProgressBar
                        progress={
                          status.quota
                            ? Math.min(100, Math.round((status.used / status.quota) * 100))
                            : 0
                        }
                        size="small"
                        tone={status.overQuota ? "critical" : "primary"}
                      />
                      <Text as="span" variant="bodySm" tone="subdued">
                        {status.overQuota
                          ? "You've used your full quota for this month. It resets on the 1st."
                          : `${(status.remaining ?? 0).toLocaleString("en-US")} remaining · resets on the 1st`}
                      </Text>
                    </BlockStack>
                  )}

                  {status.overQuota && !status.needsPayment && (
                    <Banner tone="warning" title="Monthly quota reached">
                      <p>
                        Upgrade for a higher monthly allowance — new try-ons are
                        paused for your shoppers until your quota resets.
                      </p>
                    </Banner>
                  )}

                  {PLANS[status.plan].billable && status.active && (
                    <InlineStack align="start">
                      <Form method="post">
                        <input type="hidden" name="intent" value="cancel" />
                        <Button submit tone="critical" variant="plain">
                          Cancel subscription
                        </Button>
                      </Form>
                    </InlineStack>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Plans
            </Text>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
              {PLAN_ORDER.map((key) => {
                const plan = PLANS[key];
                const isCurrent = key === currentKey;
                return (
                  <Card key={key} background={isCurrent ? "bg-surface-secondary" : undefined}>
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingSm">
                          {plan.name}
                        </Text>
                        {isCurrent && <Badge tone="success">Current</Badge>}
                      </InlineStack>
                      <Text as="p" variant="headingLg">
                        {priceLabel(plan.amount, key)}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {quotaLabel(key)}
                      </Text>
                      <Divider />
                      <Text as="p" variant="bodySm" tone="subdued">
                        {plan.blurb}
                      </Text>
                      <Box paddingBlockStart="200">
                        <PlanCta
                          planKey={key}
                          isCurrent={isCurrent}
                          currentAmount={currentAmount}
                          freePlanOpen={freePlanOpen}
                          supportEmail={supportEmail}
                        />
                      </Box>
                    </BlockStack>
                  </Card>
                );
              })}
            </InlineGrid>
            <Text as="p" variant="bodySm" tone="subdued">
              Paid plans are billed monthly through Shopify and appear on your
              regular Shopify invoice. Quotas count completed try-ons and reset
              on the 1st of each month (UTC). Need more than Platinum? Choose
              Custom to get in touch.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

function SubscribeButton({
  plan,
  label,
  variant,
}: {
  plan: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const fetcher = useFetcher<typeof action>();
  const data = fetcher.data;
  const confirmationUrl =
    data && "confirmationUrl" in data ? data.confirmationUrl : null;
  const error = data && "error" in data ? data.error : null;

  // Once the action returns an approval URL, break out of the embedded iframe to
  // Shopify's charge-approval screen. `_top` targets the topmost frame, which is
  // allowed cross-origin and is the sanctioned redirect App Bridge intercepts.
  useEffect(() => {
    if (confirmationUrl) {
      window.open(confirmationUrl, "_top");
    }
  }, [confirmationUrl]);

  // Keep the button busy through both the request and the subsequent redirect.
  const loading = fetcher.state !== "idle" || Boolean(confirmationUrl);

  return (
    <BlockStack gap="100">
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="subscribe" />
        <input type="hidden" name="plan" value={plan} />
        <Button submit variant={variant} loading={loading}>
          {label}
        </Button>
      </fetcher.Form>
      {error && (
        <Text as="span" variant="bodySm" tone="critical">
          {error}
        </Text>
      )}
    </BlockStack>
  );
}

function PlanCta({
  planKey,
  isCurrent,
  currentAmount,
  freePlanOpen,
  supportEmail,
}: {
  planKey: keyof typeof PLANS;
  isCurrent: boolean;
  currentAmount: number;
  freePlanOpen: boolean;
  supportEmail: string;
}) {
  const plan = PLANS[planKey];

  if (isCurrent) {
    return (
      <Text as="span" variant="bodySm" tone="subdued">
        Your current plan
      </Text>
    );
  }

  if (planKey === "CUSTOM") {
    return (
      <Button
        url={`mailto:${supportEmail}?subject=${encodeURIComponent("TryOn Custom plan enquiry")}`}
        external
      >
        Contact us
      </Button>
    );
  }

  if (planKey === "FREE") {
    return (
      <Text as="span" variant="bodySm" tone="subdued">
        {freePlanOpen
          ? "Cancel a paid plan to return to Free."
          : "Early access only — no longer available."}
      </Text>
    );
  }

  // Billable, self-serve plan that isn't current.
  const label = currentAmount < plan.amount ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`;
  return <SubscribeButton plan={plan.name} label={label} variant="primary" />;
}
