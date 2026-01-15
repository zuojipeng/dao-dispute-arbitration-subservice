import { z } from "zod";

export const createDisputeSchema = z.object({
  platformDisputeId: z.string().min(1),
  jobId: z.string().min(1),
  billId: z.string().min(1),
  agentId: z.string().min(1),
  initiator: z.string().min(1),
  reason: z.string().min(1),
  evidenceUri: z.string().url().optional()
});

export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;
