-- AlterTable
ALTER TABLE "Dispute"
ADD COLUMN     "votesAgent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "votesUser" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "callbackAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "callbackNextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "callbackLastError" TEXT;
