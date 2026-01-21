import { z } from "zod";

export const createDisputeSchema = z.object({
  platformId: z.string().min(1), // 必填：关联的平台ID
  platformDisputeId: z.string().min(1),
  jobId: z.string().min(1),
  billId: z.string().min(1),
  agentId: z.string().min(1),
  initiator: z.string().min(1),
  reason: z.string().min(1),
  evidenceUri: z.string().url().optional(),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address").optional()
});

export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;

export const voteSchema = z.object({
  voter: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  choice: z.union([z.literal(1), z.literal(2)])
});

export type VoteInput = z.infer<typeof voteSchema>;
