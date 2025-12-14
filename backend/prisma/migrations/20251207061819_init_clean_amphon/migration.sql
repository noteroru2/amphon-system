-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('DEPOSIT', 'CONSIGNMENT');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'FORFEITED', 'RENEWED');

-- CreateEnum
CREATE TYPE "InventorySourceType" AS ENUM ('BUY_IN', 'FORFEIT', 'CONSIGNMENT');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('AVAILABLE', 'SOLD');

-- CreateEnum
CREATE TYPE "CashbookType" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "idCard" TEXT,
    "phone" TEXT,
    "lineId" TEXT,
    "lineToken" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL,
    "customerId" INTEGER NOT NULL,
    "assetModel" TEXT,
    "assetSerial" TEXT,
    "assetCondition" TEXT,
    "assetAccessories" TEXT,
    "storageCode" TEXT,
    "principal" INTEGER NOT NULL,
    "termDays" INTEGER NOT NULL,
    "feeConfig" JSONB,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "previousContractId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractImage" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "urlOrData" TEXT NOT NULL,

    CONSTRAINT "ContractImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER,
    "title" TEXT,
    "serial" TEXT,
    "condition" TEXT,
    "accessories" TEXT,
    "storageCode" TEXT,
    "sourceType" "InventorySourceType",
    "cost" DECIMAL(12,2),
    "targetPrice" DECIMAL(12,2),
    "sellingPrice" DECIMAL(12,2),
    "buyerName" TEXT,
    "buyerPhone" TEXT,
    "buyerAddress" TEXT,
    "status" "InventoryStatus" DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soldAt" TIMESTAMP(3),

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashbookEntry" (
    "id" SERIAL NOT NULL,
    "type" "CashbookType" NOT NULL,
    "category" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "contractId" INTEGER,
    "inventoryItemId" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashbookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_idCard_key" ON "Customer"("idCard");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_code_key" ON "Contract"("code");

-- CreateIndex
CREATE INDEX "Contract_customerId_idx" ON "Contract"("customerId");

-- CreateIndex
CREATE INDEX "Contract_dueDate_idx" ON "Contract"("dueDate");

-- CreateIndex
CREATE INDEX "Contract_storageCode_idx" ON "Contract"("storageCode");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_previousContractId_fkey" FOREIGN KEY ("previousContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractImage" ADD CONSTRAINT "ContractImage_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbookEntry" ADD CONSTRAINT "CashbookEntry_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbookEntry" ADD CONSTRAINT "CashbookEntry_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
