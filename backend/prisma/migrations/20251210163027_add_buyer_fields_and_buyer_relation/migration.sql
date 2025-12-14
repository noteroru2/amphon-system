/*
  Warnings:

  - You are about to drop the column `contractId` on the `InventoryItem` table. All the data in the column will be lost.
  - You are about to drop the column `cost` on the `InventoryItem` table. All the data in the column will be lost.
  - You are about to drop the column `sellingPrice` on the `InventoryItem` table. All the data in the column will be lost.
  - You are about to drop the column `soldAt` on the `InventoryItem` table. All the data in the column will be lost.
  - You are about to drop the column `storageCode` on the `InventoryItem` table. All the data in the column will be lost.
  - You are about to drop the column `targetPrice` on the `InventoryItem` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `InventoryItem` table. All the data in the column will be lost.
  - The `sourceType` column on the `InventoryItem` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `InventoryItem` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropForeignKey
ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_contractId_fkey";

-- AlterTable
ALTER TABLE "InventoryItem" DROP COLUMN "contractId",
DROP COLUMN "cost",
DROP COLUMN "sellingPrice",
DROP COLUMN "soldAt",
DROP COLUMN "storageCode",
DROP COLUMN "targetPrice",
DROP COLUMN "title",
ADD COLUMN     "buyerCustomerId" INTEGER,
ADD COLUMN     "buyerTaxId" TEXT,
ADD COLUMN     "code" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sourceContractCode" TEXT,
ADD COLUMN     "sourceContractId" INTEGER,
ADD COLUMN     "storageLocation" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "sourceType",
ADD COLUMN     "sourceType" TEXT NOT NULL DEFAULT 'FORFEIT',
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'IN_STOCK';

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_sourceContractId_fkey" FOREIGN KEY ("sourceContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_buyerCustomerId_fkey" FOREIGN KEY ("buyerCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
