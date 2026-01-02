-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" SERIAL NOT NULL,
    "itemName" TEXT NOT NULL,
    "buyPrice" INTEGER NOT NULL,
    "sellPrice" INTEGER,
    "profit" INTEGER,
    "buyDate" TIMESTAMP(3) NOT NULL,
    "sellDate" TIMESTAMP(3),
    "note" TEXT,
    "channel" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "cpu" TEXT,
    "ram" TEXT,
    "storage" TEXT,
    "gpu" TEXT,
    "source" TEXT NOT NULL DEFAULT 'EXCEL_IMPORT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceHistory_brand_model_idx" ON "PriceHistory"("brand", "model");

-- CreateIndex
CREATE INDEX "PriceHistory_buyDate_idx" ON "PriceHistory"("buyDate");
