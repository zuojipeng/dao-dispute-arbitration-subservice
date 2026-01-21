-- P0 修复：添加 Indexer Checkpoint 表
-- 用于持久化索引进度，避免重启后重新扫描所有区块

-- CreateTable
CREATE TABLE "IndexerCheckpoint" (
    "id" TEXT NOT NULL,
    "lastBlock" INTEGER NOT NULL,
    "lastBlockHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexerCheckpoint_pkey" PRIMARY KEY ("id")
);

-- 创建初始 checkpoint（如果需要）
-- 这将在下次 indexer 启动时被实际值覆盖
-- INSERT INTO "IndexerCheckpoint" ("id", "lastBlock", "updatedAt") 
-- VALUES ('singleton', 0, NOW()) 
-- ON CONFLICT (id) DO NOTHING;


