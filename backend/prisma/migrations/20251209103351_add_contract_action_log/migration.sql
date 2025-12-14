-- CreateEnum
CREATE TYPE "ContractActionType" AS ENUM ('NEW_CONTRACT', 'RENEW_CONTRACT', 'CUT_PRINCIPAL', 'REDEEM', 'FORFEIT');

-- CreateTable
CREATE TABLE "ContractActionLog" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "action" "ContractActionType" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractActionLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ContractActionLog" ADD CONSTRAINT "ContractActionLog_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
