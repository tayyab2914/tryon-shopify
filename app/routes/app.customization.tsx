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
  TextField,
  Select,
  Checkbox,
  Button,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getShopByDomain } from "../lib/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);
  if (!shop) throw new Response("Shop missing", { status: 404 });
  return {
    buttonLabel: shop.buttonLabel,
    accentColor: shop.accentColor,
    consentText: shop.consentText,
    buttonPlacement: shop.buttonPlacement,
    buttonStyle: shop.buttonStyle,
    buttonRadius: shop.buttonRadius,
    buttonSize: shop.buttonSize,
    showOnProduct: shop.showOnProduct,
    showOnCollection: shop.showOnCollection,
    modalTitle: shop.modalTitle,
    addToCartLabel: shop.addToCartLabel,
  };
};

const STYLES = ["outline", "solid"];
const RADII = ["square", "rounded", "pill"];
const SIZES = ["small", "medium", "large"];
const PLACEMENT_VALUES = ["auto", "above-atc", "below-atc"];

function oneOf(value: FormDataEntryValue | null, allowed: string[], fallback: string): string {
  const v = String(value ?? "");
  return allowed.includes(v) ? v : fallback;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const buttonLabel = String(form.get("buttonLabel") ?? "").trim().slice(0, 40) || "Try On with AI";
  const accentColor = String(form.get("accentColor") ?? "").trim();
  const consentText = String(form.get("consentText") ?? "").trim().slice(0, 1000);
  const modalTitle = String(form.get("modalTitle") ?? "").trim().slice(0, 60) || "Virtual Fitting Room";
  const addToCartLabel = String(form.get("addToCartLabel") ?? "").trim().slice(0, 40) || "Add to Bag";

  const buttonPlacement = oneOf(form.get("buttonPlacement"), PLACEMENT_VALUES, "auto");
  const buttonStyle = oneOf(form.get("buttonStyle"), STYLES, "outline");
  const buttonRadius = oneOf(form.get("buttonRadius"), RADII, "square");
  const buttonSize = oneOf(form.get("buttonSize"), SIZES, "medium");

  const showOnProduct = form.get("showOnProduct") === "on";
  const showOnCollection = form.get("showOnCollection") === "on";

  // Reject obviously-bad colour values; leave the existing one in place.
  const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(accentColor) ? accentColor : undefined;

  await db.shop.update({
    where: { shopDomain: session.shop },
    data: {
      buttonLabel,
      consentText: consentText || undefined,
      modalTitle,
      addToCartLabel,
      buttonPlacement,
      buttonStyle,
      buttonRadius,
      buttonSize,
      showOnProduct,
      showOnCollection,
      ...(safeColor ? { accentColor: safeColor } : {}),
    },
  });

  return redirect("/app/customization");
};

const PLACEMENTS = [
  { label: "Auto (recommended)", value: "auto" },
  { label: "Above Add to Cart", value: "above-atc" },
  { label: "Below Add to Cart", value: "below-atc" },
];
const STYLE_OPTIONS = [
  { label: "Outline", value: "outline" },
  { label: "Solid", value: "solid" },
];
const RADIUS_OPTIONS = [
  { label: "Square", value: "square" },
  { label: "Rounded", value: "rounded" },
  { label: "Pill", value: "pill" },
];
const SIZE_OPTIONS = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
];

export default function Customization() {
  const loaded = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  const [buttonLabel, setButtonLabel] = useState(loaded.buttonLabel);
  const [accentColor, setAccentColor] = useState(loaded.accentColor);
  const [consentText, setConsentText] = useState(loaded.consentText);
  const [buttonPlacement, setButtonPlacement] = useState(loaded.buttonPlacement);
  const [buttonStyle, setButtonStyle] = useState(loaded.buttonStyle);
  const [buttonRadius, setButtonRadius] = useState(loaded.buttonRadius);
  const [buttonSize, setButtonSize] = useState(loaded.buttonSize);
  const [showOnProduct, setShowOnProduct] = useState(loaded.showOnProduct);
  const [showOnCollection, setShowOnCollection] = useState(loaded.showOnCollection);
  const [modalTitle, setModalTitle] = useState(loaded.modalTitle);
  const [addToCartLabel, setAddToCartLabel] = useState(loaded.addToCartLabel);

  return (
    <Page>
      <TitleBar title="Customize the widget" />
      <Form method="post">
        {/* Hidden inputs mirror the Polaris Selects/Checkboxes so they submit.
            The Polaris Checkbox's own input isn't reliably serialized, so without
            these the show-on toggles would save as off on every Save — hiding the
            Try-On button on the storefront. */}
        <input type="hidden" name="buttonPlacement" value={buttonPlacement} />
        <input type="hidden" name="buttonStyle" value={buttonStyle} />
        <input type="hidden" name="buttonRadius" value={buttonRadius} />
        <input type="hidden" name="buttonSize" value={buttonSize} />
        <input type="hidden" name="showOnProduct" value={showOnProduct ? "on" : "off"} />
        <input type="hidden" name="showOnCollection" value={showOnCollection ? "on" : "off"} />

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Button appearance</Text>
                  <TextField
                    label="Button label"
                    name="buttonLabel"
                    value={buttonLabel}
                    onChange={setButtonLabel}
                    autoComplete="off"
                    maxLength={40}
                    showCharacterCount
                  />
                  <InlineStack gap="300" wrap={false}>
                    <Box width="100%">
                      <Select
                        label="Style"
                        options={STYLE_OPTIONS}
                        value={buttonStyle}
                        onChange={setButtonStyle}
                      />
                    </Box>
                    <Box width="100%">
                      <Select
                        label="Shape"
                        options={RADIUS_OPTIONS}
                        value={buttonRadius}
                        onChange={setButtonRadius}
                      />
                    </Box>
                    <Box width="100%">
                      <Select
                        label="Size"
                        options={SIZE_OPTIONS}
                        value={buttonSize}
                        onChange={setButtonSize}
                      />
                    </Box>
                  </InlineStack>
                  <TextField
                    label="Accent color"
                    name="accentColor"
                    value={accentColor}
                    onChange={setAccentColor}
                    autoComplete="off"
                    helpText="Hex value, e.g. #1a1a1a"
                  />
                  <Select
                    label="Placement on product page"
                    options={PLACEMENTS}
                    value={buttonPlacement}
                    onChange={setButtonPlacement}
                    helpText="Auto picks the best spot. Above/Below position it relative to the Add to Cart button."
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Where it shows</Text>
                  <Checkbox
                    label="Show on product pages"
                    checked={showOnProduct}
                    onChange={setShowOnProduct}
                    helpText="The main Try-On button near Add to Cart."
                  />
                  <Checkbox
                    label="Show on collection / listing pages"
                    checked={showOnCollection}
                    onChange={setShowOnCollection}
                    helpText="A small Try-On badge on each product card."
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Modal text</Text>
                  <TextField
                    label="Modal title"
                    name="modalTitle"
                    value={modalTitle}
                    onChange={setModalTitle}
                    autoComplete="off"
                    maxLength={60}
                    showCharacterCount
                    helpText="Heading shown at the top of the try-on window."
                  />
                  <TextField
                    label="Add-to-cart button label"
                    name="addToCartLabel"
                    value={addToCartLabel}
                    onChange={setAddToCartLabel}
                    autoComplete="off"
                    maxLength={40}
                    showCharacterCount
                  />
                  <TextField
                    label="Consent text"
                    name="consentText"
                    value={consentText}
                    onChange={setConsentText}
                    multiline={4}
                    autoComplete="off"
                    helpText="Shown beside the upload checkbox in the modal."
                    maxLength={1000}
                    showCharacterCount
                  />
                  <InlineStack align="end">
                    <Button submit variant="primary" loading={saving}>
                      Save changes
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Live preview</Text>
                <Box
                  padding="400"
                  background="bg-surface-secondary"
                  borderWidth="025"
                  borderRadius="200"
                  borderColor="border"
                >
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      How the button will look on your storefront:
                    </Text>
                    <PreviewButton
                      label={buttonLabel}
                      color={accentColor}
                      style={buttonStyle}
                      radius={buttonRadius}
                      size={buttonSize}
                    />
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}

function PreviewButton({
  label,
  color,
  style,
  radius,
  size,
}: {
  label: string;
  color: string;
  style: string;
  radius: string;
  size: string;
}) {
  const safe = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#1a1a1a";
  const solid = style === "solid";
  const radiusPx = { square: "2px", rounded: "10px", pill: "999px" }[radius] || "2px";
  const sizeSpec =
    ({
      small: { padding: "11px 14px", font: "11px" },
      medium: { padding: "16px", font: "12px" },
      large: { padding: "20px", font: "13px" },
    } as const)[size as "small" | "medium" | "large"] || { padding: "16px", font: "12px" };

  return (
    <button
      type="button"
      disabled
      style={{
        width: "100%",
        padding: sizeSpec.padding,
        background: solid ? safe : "transparent",
        color: solid ? "#fff" : safe,
        border: `1px solid ${safe}`,
        borderRadius: radiusPx,
        fontFamily: "inherit",
        fontSize: sizeSpec.font,
        letterSpacing: "3px",
        textTransform: "uppercase",
        cursor: "default",
      }}
    >
      {label || "Try On with AI"}
    </button>
  );
}
