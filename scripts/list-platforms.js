#!/usr/bin/env node
/**
 * 列出所有平台的脚本
 * 
 * 使用方法：
 *   node scripts/list-platforms.js
 * 
 * 注意：如果 DATABASE_URL 使用的是 Docker 容器地址（postgres:5432），
 * 需要在宿主机运行时改为 localhost:5432
 */

const { PrismaClient } = require("@prisma/client");

// 如果是宿主机运行，自动将 postgres:5432 替换为 localhost:5432
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres:5432')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace('postgres:5432', 'localhost:5432');
}

const prisma = new PrismaClient();

async function main() {
  console.log("=== 查询数据库中的平台 ===\n");
  
  try {
    // 查询所有平台
    const platforms = await prisma.platform.findMany({
      orderBy: { id: "asc" }
    });

    console.log(`当前数据库中共有 ${platforms.length} 个平台：\n`);

    if (platforms.length === 0) {
      console.log("  ⚠️  数据库中没有平台");
    } else {
      platforms.forEach((platform) => {
        console.log(`- ${platform.id} (${platform.name})`);
        console.log(`  代币合约: ${platform.tokenContract}`);
        console.log(`  最小余额: ${platform.minBalance}`);
        console.log(`  链ID: ${platform.chainId}`);
        console.log(`  描述: ${platform.description || "无"}\n`);
      });
    }

    // 检查是否存在 agent-platform
    const agentPlatform = platforms.find((p) => p.id === "agent-platform");

    if (!agentPlatform) {
      console.log("⚠️  agent-platform 不存在\n");
      console.log("如果需要创建 agent-platform，请：");
      console.log("1. 在 .env 文件中配置：");
      console.log("   AGENT_PLATFORM_TOKEN_CONTRACT=0x...");
      console.log("   AGENT_PLATFORM_MIN_BALANCE=100000000000000000000");
      console.log("\n2. 然后运行 seed 脚本：");
      console.log("   pnpm --filter dao-service exec ts-node prisma/seed-default-platform.ts");
    } else {
      console.log("✅ agent-platform 已存在");
      console.log(`   代币合约: ${agentPlatform.tokenContract}`);
      console.log(`   最小余额: ${agentPlatform.minBalance}`);
    }
    
  } catch (error) {
    console.error("\n❌ 查询失败:", error.message);
    
    if (error.code === 'P2021') {
      console.error("\n错误：表不存在！");
      console.error("请先运行数据库迁移");
    } else if (error.code === 'P1001') {
      console.error("\n错误：无法连接到数据库！");
      console.error("请检查 DATABASE_URL 环境变量和数据库服务");
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

