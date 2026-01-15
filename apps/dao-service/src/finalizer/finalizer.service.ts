import { Injectable, Logger } from "@nestjs/common";
import { CallbackStatus, DisputeResult, DisputeStatus } from "@prisma/client";
import { ChainService } from "../chain/chain.service";
import { PrismaService } from "../prisma/prisma.service";

const FINALIZER_INTERVAL_MS = 60_000;

@Injectable()
export class FinalizerService {
  private readonly logger = new Logger(FinalizerService.name);
  private running = false;
  private interval?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly chainService: ChainService) {}

  start() {
    if (this.interval) {
      return;
    }
    this.runOnce().catch((error) => this.logger.error(error));
    this.interval = setInterval(() => {
      this.runOnce().catch((error) => this.logger.error(error));
    }, FINALIZER_INTERVAL_MS);
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
          status: DisputeStatus.VOTING,
          deadline: { lt: now }
        },
        orderBy: { deadline: "asc" },
        take: 20
      });

      for (const dispute of disputes) {
        try {
          const tx = await this.chainService.finalizeDispute(dispute.contractDisputeId);
          const receipt = await tx.wait();
          const iface = this.chainService.getInterface();

          for (const log of receipt.logs ?? []) {
            try {
              const parsed = iface.parseLog(log);
              if (parsed?.name !== "DisputeFinalized") {
                continue;
              }
              const resultValue = Number(parsed.args.result);
              const result = this.mapResult(resultValue);
              const votesAgent = Number(parsed.args.votesAgent);
              const votesUser = Number(parsed.args.votesUser);

              await this.prisma.dispute.update({
                where: { id: dispute.id },
                data: {
                  status: DisputeStatus.RESOLVED,
                  result,
                  votesAgent,
                  votesUser,
                  finalizeTxHash: receipt.hash ?? tx.hash,
                  callbackStatus: CallbackStatus.PENDING
                }
              });
              break;
            } catch {
              continue;
            }
          }
        } catch (error) {
          this.logger.warn(
            `Finalize failed for disputeId=${dispute.contractDisputeId.toString()}: ${error}`
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private mapResult(resultValue: number): DisputeResult {
    if (resultValue === 1) {
      return DisputeResult.SUPPORT_AGENT;
    }
    return DisputeResult.SUPPORT_USER;
  }
}
