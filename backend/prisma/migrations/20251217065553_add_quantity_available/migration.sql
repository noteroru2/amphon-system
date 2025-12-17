/*
  Warnings:

  - The values [BUY] on the enum `InventorySourceType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `unit` on the `InventoryItem` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "InventorySourceType_new" AS ENUM ('FORFEIT', 'PURCHASE', 'CONSIGNMENT', 'OTHER');
ALTER TABLE "InventoryItem" ALTER COLUMN "sourceType" TYPE "InventorySourceType_new" USING ("sourceType"::text::"InventorySourceType_new");
ALTER TYPE "InventorySourceType" RENAME TO "InventorySourceType_old";
ALTER TYPE "InventorySourceType_new" RENAME TO "InventorySourceType";
DROP TYPE "public"."InventorySourceType_old";
COMMIT;

-- AlterEnum
ALTER TYPE "InventoryStatus" ADD VALUE 'WRITTEN_OFF';

-- AlterTable
ALTER TABLE "InventoryItem" DROP COLUMN "unit",
ADD COLUMN     "consignmentContractId" INTEGER,
ADD COLUMN     "quantityAvailable" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "quantitySold" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "cost" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "appraisedPrice" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "targetPrice" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "sellingPrice" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "grossProfit" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "netProfit" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "sourceType" DROP NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ConsignmentContract" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "sellerIdCard" TEXT,
    "sellerPhone" TEXT,
    "sellerAddress" TEXT,
    "itemName" TEXT NOT NULL,
    "serial" TEXT,
    "condition" TEXT,
    "accessories" TEXT,
    "photos" JSONB,
    "advanceAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netToSeller" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "targetPrice" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inventoryItemId" INTEGER,

    CONSTRAINT "ConsignmentContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSuggestion" (
    "id" SERIAL NOT NULL,
    "itemName" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "spec" TEXT,
    "condition" TEXT,
    "accessories" TEXT,
    "notes" TEXT,
    "appraisedMin" DECIMAL(12,2),
    "appraisedMax" DECIMAL(12,2),
    "appraisedPrice" DECIMAL(12,2),
    "targetPrice" DECIMAL(12,2),
    "confidence" INTEGER,
    "rationale" TEXT,
    "refs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsignmentContract_code_key" ON "ConsignmentContract"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ConsignmentContract_inventoryItemId_key" ON "ConsignmentContract"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "ConsignmentContract" ADD CONSTRAINT "ConsignmentContract_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
