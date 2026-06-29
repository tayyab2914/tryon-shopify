import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Checkbox,
  TextField,
  Select,
  Button,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getShopByDomain } from "../lib/shop.server";
import { SUPPORT_EMAIL } from "../lib/links";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);
  if (!shop) throw new Response("Shop missing", { status: 404 });
  return {
    widgetEnabled: shop.widgetEnabled,
    tryOnLimitEnabled: shop.tryOnLimitEnabled,
    tryOnLimitPerIp: shop.tryOnLimitPerIp,
    tryOnLimitPeriod: shop.tryOnLimitPeriod,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const widgetEnabled = form.get("widgetEnabled") === "on";
  const tryOnLimitEnabled = form.get("tryOnLimitEnabled") === "on";
  const tryOnLimitPerIp = Math.max(
    1,
    Math.min(100, Number(form.get("tryOnLimitPerIp") ?? 5) || 5),
  );
  const tryOnLimitPeriod =
    form.get("tryOnLimitPeriod") === "MONTHLY" ? "MONTHLY" : "DAILY";

  await db.shop.update({
    where: { shopDomain: session.shop },
    data: { widgetEnabled, tryOnLimitEnabled, tryOnLimitPerIp, tryOnLimitPeriod },
  });

  return redirect("/app/settings");
};

const PERIODS = [
  { label: "Per day", value: "DAILY" },
  { label: "Per month", value: "MONTHLY" },
];

export default function Settings() {
  const loaded = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  const [widgetEnabled, setWidgetEnabled] = useState(loaded.widgetEnabled);
  const [limitEnabled, setLimitEnabled] = useState(loaded.tryOnLimitEnabled);
  const [limitPerIp, setLimitPerIp] = useState(String(loaded.tryOnLimitPerIp));
  const [limitPeriod, setLimitPeriod] = useState(loaded.tryOnLimitPeriod);

  return (
    <Page>
      <TitleBar title="Settings" />
      <Form method="post">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Widget</Text>
                {/* Submit the boolean explicitly from React state rather than
                    relying on the native "checked checkbox sends on" rule — the
                    Polaris Checkbox's own input wasn't reliably serialized, so a
                    checked box could save as off. The hidden input always wins. */}
                <input
                  type="hidden"
                  name="widgetEnabled"
                  value={widgetEnabled ? "on" : "off"}
                />
                <Checkbox
                  label="Enable the TryOn widget on my storefront"
                  checked={widgetEnabled}
                  onChange={setWidgetEnabled}
                  helpText="When off, the script still loads but no buttons appear and the try-on API is blocked."
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Rate limit</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Caps how many try-ons one shopper can run, identified by IP.
                </Text>
                <input
                  type="hidden"
                  name="tryOnLimitEnabled"
                  value={limitEnabled ? "on" : "off"}
                />
                <Checkbox
                  label="Enable per-visitor rate limit"
                  checked={limitEnabled}
                  onChange={setLimitEnabled}
                />
                {/* Hidden inputs carry the values: a disabled TextField/Select
                    is NOT submitted, so without these, saving while the limit is
                    toggled off would reset per-visitor count + window to defaults. */}
                <input type="hidden" name="tryOnLimitPerIp" value={limitPerIp} />
                <input type="hidden" name="tryOnLimitPeriod" value={limitPeriod} />
                <InlineStack gap="300">
                  <TextField
                    label="Try-ons per visitor"
                    type="number"
                    min={1}
                    max={100}
                    value={limitPerIp}
                    onChange={setLimitPerIp}
                    autoComplete="off"
                    disabled={!limitEnabled}
                  />
                  <Select
                    label="Window"
                    options={PERIODS}
                    value={limitPeriod}
                    onChange={setLimitPeriod}
                    disabled={!limitEnabled}
                  />
                </InlineStack>
                <InlineStack align="end">
                  <Button submit variant="primary" loading={saving}>
                    Save settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Privacy</Text>
                  <Banner tone="info" title="No customer photos are stored">
                    <p>
                      Shopper photos are processed in-memory by the try-on engine
                      and discarded. Only a salted hash of the visitor IP is kept,
                      used solely for rate-limiting.
                    </p>
                  </Banner>
                  <Button
                    onClick={() => {
                      if (typeof window !== "undefined")
                        window.open("/privacy", "_blank", "noopener,noreferrer");
                    }}
                    variant="plain"
                  >
                    Read the full privacy policy
                  </Button>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Need help?</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Reach out and we&rsquo;ll get back to you.
                  </Text>
                  <Button
                    onClick={() => {
                      if (typeof window !== "undefined")
                        window.location.href = `mailto:${SUPPORT_EMAIL}`;
                    }}
                  >
                    Email support
                  </Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}
