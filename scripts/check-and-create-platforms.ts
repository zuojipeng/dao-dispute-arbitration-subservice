#!/usr/bin/env ts-node
/**
 * 检查并创建预置平台的脚本
 * 
 * 使用方法：
 *   ts-node scripts/check-and-create-platforms.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== 检查预置平台 ===\n");

  try {
    // 查询所有平台
    const platforms = await prisma.platform.findMany({
      orderBy: { id: "asc" }
    });

    console.log(`当前数据库中共有 ${platforms.length} 个平台：\n`);

    platforms.forEach((platform) => {
      console.log(`- ${platform.id} (${platform.name})`);
      console.log(`  代币合约: ${platform.tokenContract}`);
      console.log(`  最小余额: ${platform.minBalance}`);
      console.log(`  链ID: ${platform.chainId}\n`);
    });

    // 检查是否存在 agent-platform
    const agentPlatform = platforms.find((p) => p.id === "agent-platform");

    if (!agentPlatform) {
      console.log("⚠️  agent-platform 不存在，准备创建...\n");

      // 从环境变量获取配置
      const tokenContract =
        process.env.AGENT_PLATFORM_TOKEN_CONTRACT ||
        process.env.DEFAULT_TOKEN_CONTRACT ||
        process.env.TOKEN_CONTRACT;
      const minBalance =
        process.env.AGENT_PLATFORM_MIN_BALANCE ||
        process.env.DEFAULT_MIN_BALANCE ||
        process.env.MIN_BALANCE;
      const chainId = parseInt(process.env.CHAIN_ID || "11155111", 10);

      if (!tokenContract || !minBalance) {
        console.log(
          "❌ 环境变量未配置，无法创建 agent-platform"
        );
        console.log(
          "\n请先在 .env 文件中配置以下环境变量："
        );
        console.log("  AGENT_PLATFORM_TOKEN_CONTRACT=0x...");
        console.log("  AGENT_PLATFORM_MIN_BALANCE=100000000000000000000");
        console.log("\n或者运行 seed 脚本自动创建：");
        console.log(
          "  ts-node apps/dao-service/prisma/seed-default-platform.ts"
        );
        return;
      }

      // 创建 agent-platform
      const created = await prisma.platform.create({
        data: {
          id: "agent-platform",
          name: "Agent Platform",
          tokenContract: tokenContract.toLowerCase(),
          minBalance: minBalance,
          chainId: chainId,
          description: "Agent平台，使用APT代币",
        },
      });

      console.log("✅ agent-platform 创建成功！");
      console.log(`   ID: ${created.id}`);
      console.log(`   Name: ${created.name}`);
      console.log(`   Token Contract: ${created.tokenContract}`);
      console.log(`   Min Balance: ${created.minBalance}`);
      console.log(`   Chain ID: ${created.chainId}\n`);
    } else {
      console.log("✅ agent-platform 已存在");
      console.log(`   代币合约: ${agentPlatform.tokenContract}`);
      console.log(`   最小余额: ${agentPlatform.minBalance}\n`);
    }
  } catch (error: any) {
    console.error("❌ 错误:", error.message);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("❌ 错误:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


