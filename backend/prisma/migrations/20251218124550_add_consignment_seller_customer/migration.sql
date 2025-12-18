-- AlterTable
ALTER TABLE "ConsignmentContract" ADD COLUMN     "sellerCustomerId" INTEGER;

-- AddForeignKey
ALTER TABLE "ConsignmentContract" ADD CONSTRAINT "ConsignmentContract_sellerCustomerId_fkey" FOREIGN KEY ("sellerCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
