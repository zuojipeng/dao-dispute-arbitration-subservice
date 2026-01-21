import { z } from "zod";

export const createPlatformSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tokenContract: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token contract address"),
  minBalance: z.string().min(1),
  chainId: z.number().int().positive(),
  description: z.string().optional(),
  webhookUrl: z.string().url().optional()
});

export type CreatePlatformInput = z.infer<typeof createPlatformSchema>;

export const updatePlatformSchema = z.object({
  name: z.string().min(1).optional(),
  tokenContract: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token contract address").optional(),
  minBalance: z.string().min(1).optional(),
  chainId: z.number().int().positive().optional(),
  description: z.string().optional(),
  webhookUrl: z.string().url().optional()
});

export type UpdatePlatformInput = z.infer<typeof updatePlatformSchema>;


