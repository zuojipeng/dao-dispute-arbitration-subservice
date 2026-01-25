import { z } from "zod";

export const createDisputeSchema = z.object({
  platformId: z.string().min(1), // 必填：关联的平台ID
  platformDisputeId: z.string().min(1) // 必填：平台争议唯一标识
});

export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;

export const voteSchema = z.object({
  voter: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  choice: z.union([z.literal(1), z.literal(2)])
});

export type VoteInput = z.infer<typeof voteSchema>;
