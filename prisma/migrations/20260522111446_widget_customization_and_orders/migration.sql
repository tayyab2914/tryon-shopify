-- AlterTable
ALTER TABLE "OrderEvent" ADD COLUMN     "attributed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "addToCartLabel" TEXT NOT NULL DEFAULT 'Add to Bag',
ADD COLUMN     "buttonRadius" TEXT NOT NULL DEFAULT 'square',
ADD COLUMN     "buttonSize" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "buttonStyle" TEXT NOT NULL DEFAULT 'outline',
ADD COLUMN     "modalTitle" TEXT NOT NULL DEFAULT 'Virtual Fitting Room',
ADD COLUMN     "pixelActivated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showOnCollection" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showOnProduct" BOOLEAN NOT NULL DEFAULT true;
