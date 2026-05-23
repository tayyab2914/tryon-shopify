-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "widgetEnabled" BOOLEAN NOT NULL DEFAULT true,
    "buttonLabel" TEXT NOT NULL DEFAULT 'Try On with AI',
    "accentColor" TEXT NOT NULL DEFAULT '#1a1a1a',
    "consentText" TEXT NOT NULL DEFAULT 'I agree to upload my photo for a one-time virtual try-on. I understand it is processed only to generate my result, is never saved to any database, and is removed the moment I refresh or close this window.',
    "buttonPlacement" TEXT NOT NULL DEFAULT 'auto',
    "tryOnLimitEnabled" BOOLEAN NOT NULL DEFAULT true,
    "tryOnLimitPerIp" INTEGER NOT NULL DEFAULT 5,
    "tryOnLimitPeriod" TEXT NOT NULL DEFAULT 'DAILY',
    "plan" TEXT NOT NULL DEFAULT 'BETA_FREE',
    "chargeId" TEXT,
    "trialEndsAt" TIMESTAMP(3),

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TryOn" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT,
    "productHandle" TEXT,
    "productUrl" TEXT,
    "garment" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "ipHash" TEXT NOT NULL,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TryOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartAdd" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "tryOnId" TEXT,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartAdd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "totalPrice" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "Shop_uninstalledAt_idx" ON "Shop"("uninstalledAt");

-- CreateIndex
CREATE INDEX "TryOn_shopId_createdAt_idx" ON "TryOn"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "TryOn_shopId_status_idx" ON "TryOn"("shopId", "status");

-- CreateIndex
CREATE INDEX "CartAdd_shopId_createdAt_idx" ON "CartAdd"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "CartAdd_tryOnId_idx" ON "CartAdd"("tryOnId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderEvent_shopifyOrderId_key" ON "OrderEvent"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "OrderEvent_shopId_createdAt_idx" ON "OrderEvent"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "TryOn" ADD CONSTRAINT "TryOn_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartAdd" ADD CONSTRAINT "CartAdd_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartAdd" ADD CONSTRAINT "CartAdd_tryOnId_fkey" FOREIGN KEY ("tryOnId") REFERENCES "TryOn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
