import { z } from "zod";

export const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RPC_URL: z.string().min(1),
  CHAIN_ID: z.coerce.number().int().positive(),
  VOTING_CONTRACT: z.string().min(1),
  TOKEN_CONTRACT: z.string().min(1),
  MIN_BALANCE: z.string().min(1),
  PLATFORM_WEBHOOK_URL: z.string().min(1),
  HMAC_SECRET: z.string().min(1),
  START_BLOCK: z.coerce.number().int().nonnegative(),
  PORT: z.coerce.number().int().positive().optional(),
  SIGNER_PRIVATE_KEY: z.string().min(1).optional()
});

export type AppConfig = z.infer<typeof configSchema>;
