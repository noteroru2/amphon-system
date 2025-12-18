-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "sellerCustomerId" INTEGER;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_sellerCustomerId_fkey" FOREIGN KEY ("sellerCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
