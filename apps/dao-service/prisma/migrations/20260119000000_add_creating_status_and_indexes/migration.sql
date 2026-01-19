-- AlterEnum
-- 添加 CREATING 状态到 DisputeStatus 枚举（在 VOTING 之前）
ALTER TYPE "DisputeStatus" ADD VALUE IF NOT EXISTS 'CREATING';

-- AlterTable
-- 添加 createdAt 和 updatedAt 时间戳字段
ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
-- 添加 contractDisputeId 索引以优化链上事件索引查询
CREATE INDEX IF NOT EXISTS "Dispute_contractDisputeId_idx" ON "Dispute"("contractDisputeId");

-- CreateIndex
-- 添加复合索引以优化 Finalizer 查询（查找到期的 VOTING 状态争议）
CREATE INDEX IF NOT EXISTS "Dispute_status_deadline_idx" ON "Dispute"("status", "deadline");

