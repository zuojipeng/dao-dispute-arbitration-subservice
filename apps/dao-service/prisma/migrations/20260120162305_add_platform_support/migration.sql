-- AlterTable
ALTER TABLE "Dispute" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IndexerCheckpoint" ALTER COLUMN "id" SET DEFAULT 'singleton';
