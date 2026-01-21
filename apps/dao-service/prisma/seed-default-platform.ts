/**
 * Seed脚本：创建预置平台并迁移现有争议
 * 
 * 使用方法：
 *   ts-node prisma/seed-default-platform.ts
 * 
 * 支持预置多个平台，每个平台的配置通过环境变量设置：
 * - DEFAULT_TOKEN_CONTRACT / DEFAULT_MIN_BALANCE (默认平台，向后兼容)
 * - AGENT_PLATFORM_TOKEN_CONTRACT / AGENT_PLATFORM_MIN_BALANCE (Agent平台)
 * - FREELANCER_PLATFORM_TOKEN_CONTRACT / FREELANCER_PLATFORM_MIN_BALANCE (Freelancer平台)
 * 
 * 或者手动执行SQL创建平台。
 */

import { PrismaClient } from "@prisma/client";

// 如果是宿主机运行，自动将 postgres:5432 替换为 localhost:5432
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres:5432')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace('postgres:5432', 'localhost:5432');
}

const prisma = new PrismaClient();

// 预置平台配置定义
interface PlatformConfig {
  id: string;
  name: string;
  tokenContractEnv: string; // 环境变量名
  minBalanceEnv: string; // 环境变量名
  description: string;
}

// 预置平台列表
const PRESET_PLATFORMS: PlatformConfig[] = [
  {
    id: "default",
    name: "Default Platform",
    tokenContractEnv: "DEFAULT_TOKEN_CONTRACT",
    minBalanceEnv: "DEFAULT_MIN_BALANCE",
    description: "默认平台，用于向后兼容现有争议"
  },
  {
    id: "agent-platform",
    name: "Agent Platform",
    tokenContractEnv: "AGENT_PLATFORM_TOKEN_CONTRACT",
    minBalanceEnv: "AGENT_PLATFORM_MIN_BALANCE",
    description: "Agent平台，使用APT代币"
  },
  {
    id: "freelancer-platform",
    name: "Freelancer Platform",
    tokenContractEnv: "FREELANCER_PLATFORM_TOKEN_CONTRACT",
    minBalanceEnv: "FREELANCER_PLATFORM_MIN_BALANCE",
    description: "Freelancer平台，使用FLT代币"
  }
];

async function main() {
  console.log("开始创建预置平台...\n");

  const chainId = parseInt(process.env.CHAIN_ID || "11155111", 10);
  let createdCount = 0;
  let updatedCount = 0;

  // 遍历预置平台列表
  for (const platformConfig of PRESET_PLATFORMS) {
    // 获取环境变量（支持fallback）
    let tokenContract = process.env[platformConfig.tokenContractEnv];
    let minBalance = process.env[platformConfig.minBalanceEnv];

    // 默认平台支持fallback到旧的环境变量
    if (platformConfig.id === "default") {
      tokenContract = tokenContract || process.env.TOKEN_CONTRACT;
      minBalance = minBalance || process.env.MIN_BALANCE;
    }

    // 如果配置不存在，跳过（非默认平台可选）
    if (!tokenContract || !minBalance) {
      if (platformConfig.id === "default") {
        throw new Error(
          `环境变量缺失：需要 ${platformConfig.tokenContractEnv} (或 TOKEN_CONTRACT) 和 ${platformConfig.minBalanceEnv} (或 MIN_BALANCE)`
        );
      } else {
        console.log(`⏭️  跳过平台 ${platformConfig.id}（环境变量未配置）`);
        continue;
      }
    }

    // 检查平台是否已存在
    const existingBefore = await prisma.platform.findUnique({ where: { id: platformConfig.id } });
    const isNewPlatform = !existingBefore;

    // 创建或更新平台
    const platform = await prisma.platform.upsert({
      where: { id: platformConfig.id },
      update: {
        name: platformConfig.name,
        tokenContract: tokenContract.toLowerCase(),
        minBalance: minBalance,
        chainId: chainId,
        description: platformConfig.description
      },
      create: {
        id: platformConfig.id,
        name: platformConfig.name,
        tokenContract: tokenContract.toLowerCase(),
        minBalance: minBalance,
        chainId: chainId,
        description: platformConfig.description
      }
    });
    
    if (isNewPlatform) {
      createdCount++;
      console.log(`✅ 平台已创建: ${platform.id} (${platform.name})`);
    } else {
      updatedCount++;
      console.log(`✅ 平台已更新: ${platform.id} (${platform.name})`);
    }
    console.log(`   代币合约: ${platform.tokenContract}`);
    console.log(`   最小余额: ${platform.minBalance}\n`);
  }

  // 迁移现有争议到默认平台（如果默认平台存在）
  const defaultPlatform = await prisma.platform.findUnique({ where: { id: "default" } });
  if (defaultPlatform) {
    const result = await prisma.dispute.updateMany({
      where: {
        platformId: null
      },
      data: {
        platformId: "default"
      }
    });

    if (result.count > 0) {
      console.log(`已迁移 ${result.count} 个争议到默认平台`);
    }
  }

  console.log(`\n✅ 完成！创建 ${createdCount} 个平台，更新 ${updatedCount} 个平台`);
}

main()
  .catch((e) => {
    console.error("❌ 错误:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

