/*
  Warnings:

  - You are about to drop the column `lineToken` on the `Customer` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[lineUserId]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "lineToken",
ADD COLUMN     "lineUserId" TEXT;

-- CreateTable
CREATE TABLE "LineNotifyLog" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "contractId" INTEGER NOT NULL,
    "rule" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineNotifyLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LineNotifyLog_contractId_idx" ON "LineNotifyLog"("contractId");

-- CreateIndex
CREATE INDEX "LineNotifyLog_scheduledDate_idx" ON "LineNotifyLog"("scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "LineNotifyLog_customerId_contractId_rule_scheduledDate_key" ON "LineNotifyLog"("customerId", "contractId", "rule", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_lineUserId_key" ON "Customer"("lineUserId");

-- AddForeignKey
ALTER TABLE "LineNotifyLog" ADD CONSTRAINT "LineNotifyLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineNotifyLog" ADD CONSTRAINT "LineNotifyLog_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
