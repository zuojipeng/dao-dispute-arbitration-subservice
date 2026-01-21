-- 添加多平台多代币支持
-- 1. 创建Platform表
-- 2. 添加Dispute.platformId字段（nullable，支持向后兼容）
-- 3. 创建索引以优化查询性能

-- CreateTable
CREATE TABLE "Platform" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenContract" TEXT NOT NULL,
    "minBalance" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "description" TEXT,
    "webhookUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Platform_tokenContract_idx" ON "Platform"("tokenContract");

-- AlterTable: 添加platformId字段（nullable for backward compatibility）
ALTER TABLE "Dispute" ADD COLUMN "platformId" TEXT;

-- CreateIndex: 为platformId创建索引以优化查询
CREATE INDEX "Dispute_platformId_idx" ON "Dispute"("platformId");

-- AddForeignKey: 添加外键约束
-- 注意：由于platformId是nullable的，ON DELETE使用SetNull以支持向后兼容
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_platformId_fkey" 
    FOREIGN KEY ("platformId") REFERENCES "Platform"("id") 
    ON DELETE SET NULL ON UPDATE CASCADE;


