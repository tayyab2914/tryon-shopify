import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// `PrismaSessionStorage` ships its own copy of `@shopify/shopify-api`, so the
// inferred type doesn't structurally match the one `shopify-app-remix` expects
// even though it works at runtime. The any-cast bridges that mismatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaSessionStorage = new PrismaSessionStorage(prisma) as any;

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: prismaSessionStorage,
  distribution: AppDistribution.AppStore,
  // Recurring plans. Keys MUST match the billable plan ids in `app/lib/plans.ts`
  // (BILLABLE_PLAN_IDS) and the Shopify subscription names. Free / Custom are
  // not Shopify charges — they're DB-only states, so they aren't listed here.
  billing: {
    Basic: {
      lineItems: [
        { amount: 9.99, currencyCode: "USD", interval: BillingInterval.Every30Days },
      ],
    },
    Pro: {
      lineItems: [
        { amount: 49.99, currencyCode: "USD", interval: BillingInterval.Every30Days },
      ],
    },
    Platinum: {
      lineItems: [
        { amount: 99.99, currencyCode: "USD", interval: BillingInterval.Every30Days },
      ],
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
