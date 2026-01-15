-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('VOTING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DisputeResult" AS ENUM ('SUPPORT_AGENT', 'SUPPORT_USER');

-- CreateEnum
CREATE TYPE "CallbackStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "platformDisputeId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "initiator" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceUri" TEXT,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "contractDisputeId" BIGINT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "DisputeStatus" NOT NULL,
    "result" "DisputeResult",
    "finalizeTxHash" TEXT,
    "callbackStatus" "CallbackStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "voter" TEXT NOT NULL,
    "choice" INTEGER NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_platformDisputeId_key" ON "Dispute"("platformDisputeId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_disputeId_voter_key" ON "Vote"("disputeId", "voter");

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
