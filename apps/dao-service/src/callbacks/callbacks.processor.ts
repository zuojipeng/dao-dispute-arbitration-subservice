import { Injectable, Logger } from "@nestjs/common";
import { CallbackStatus, DisputeStatus } from "@prisma/client";
import { CallbacksService } from "./callbacks.service";
import { PrismaService } from "../prisma/prisma.service";

const CALLBACK_INTERVAL_MS = 15_000;
const CALLBACK_BASE_DELAY_SECONDS = 10;
const CALLBACK_MAX_DELAY_SECONDS = 3600;
const CALLBACK_MAX_ATTEMPTS = 8;

@Injectable()
export class CallbacksProcessor {
  private readonly logger = new Logger(CallbacksProcessor.name);
  private running = false;
  private interval?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly callbacksService: CallbacksService
  ) {}

  start() {
    if (this.interval) {
      return;
    }
    this.runOnce().catch((error) => this.logger.error(error));
    this.interval = setInterval(() => {
      this.runOnce().catch((error) => this.logger.error(error));
    }, CALLBACK_INTERVAL_MS);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  async runOnce() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const now = new Date();
      const disputes = await this.prisma.dispute.findMany({
        where: {
          status: DisputeStatus.RESOLVED,
          callbackStatus: { in: [CallbackStatus.PENDING, CallbackStatus.FAILED] },
          OR: [{ callbackNextAttemptAt: null }, { callbackNextAttemptAt: { lte: now } }]
        },
        orderBy: { deadline: "asc" },
        take: 10
      });

      for (const dispute of disputes) {
        const attempts = dispute.callbackAttempts + 1;
        if (attempts > CALLBACK_MAX_ATTEMPTS) {
          await this.prisma.dispute.update({
            where: { id: dispute.id },
            data: { callbackStatus: CallbackStatus.FAILED }
          });
          continue;
        }

        const payload = {
          platformDisputeId: dispute.platformDisputeId,
          jobId: dispute.jobId,
          billId: dispute.billId,
          result: dispute.result,
          votesAgent: dispute.votesAgent,
          votesUser: dispute.votesUser,
          txHash: dispute.finalizeTxHash,
          chainId: dispute.chainId,
          contractAddress: dispute.contractAddress,
          contractDisputeId: dispute.contractDisputeId.toString()
        };

        try {
          await this.callbacksService.sendResolvedCallback(payload);
          await this.prisma.dispute.update({
            where: { id: dispute.id },
            data: {
              callbackStatus: CallbackStatus.SENT,
              callbackAttempts: attempts,
              callbackLastError: null,
              callbackNextAttemptAt: null
            }
          });
        } catch (error) {
          const delaySeconds = Math.min(
            CALLBACK_BASE_DELAY_SECONDS * Math.pow(2, attempts - 1),
            CALLBACK_MAX_DELAY_SECONDS
          );
          await this.prisma.dispute.update({
            where: { id: dispute.id },
            data: {
              callbackStatus: CallbackStatus.FAILED,
              callbackAttempts: attempts,
              callbackLastError: this.formatError(error),
              callbackNextAttemptAt: new Date(Date.now() + delaySeconds * 1000)
            }
          });
        }
      }
    } finally {
      this.running = false;
    }
  }

  private formatError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.length > 1000 ? message.slice(0, 1000) : message;
  }
}
