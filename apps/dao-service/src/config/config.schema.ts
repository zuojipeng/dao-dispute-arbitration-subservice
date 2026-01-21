import { z } from "zod";

export const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RPC_URL: z.string().min(1),
  CHAIN_ID: z.coerce.number().int().positive(),
  VOTING_CONTRACT: z.string().min(1),
  TOKEN_CONTRACT: z.string().min(1), // 保留用于向后兼容
  MIN_BALANCE: z.string().min(1), // 保留用于向后兼容
  DEFAULT_TOKEN_CONTRACT: z.string().optional(), // 默认平台代币合约（优先使用）
  DEFAULT_MIN_BALANCE: z.string().optional(), // 默认平台最小余额（优先使用）
  // 预置平台配置（可选，用于seed脚本）
  // AGENT_PLATFORM_TOKEN_CONTRACT: z.string().optional(), // Agent平台代币合约
  // AGENT_PLATFORM_MIN_BALANCE: z.string().optional(), // Agent平台最小余额
  // FREELANCER_PLATFORM_TOKEN_CONTRACT: z.string().optional(), // Freelancer平台代币合约
  // FREELANCER_PLATFORM_MIN_BALANCE: z.string().optional(), // Freelancer平台最小余额
  MIN_BALANCE_MAP: z.string().optional(), // JSON格式: {"0xTokenA": "100000000000000000000", "0xTokenB": "50000000000000000"}
  PLATFORM_WEBHOOK_URL: z.string().min(1),
  HMAC_SECRET: z.string().min(1),
  START_BLOCK: z.coerce.number().int().nonnegative(),
  PORT: z.coerce.number().int().positive().optional(),
  SIGNER_PRIVATE_KEY: z.string().min(1).optional()
});

export type AppConfig = z.infer<typeof configSchema>;
