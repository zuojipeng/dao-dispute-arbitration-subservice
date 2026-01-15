import { Injectable, Logger } from "@nestjs/common";
import { CallbackStatus, DisputeResult, DisputeStatus, Prisma } from "@prisma/client";
import { ethers } from "ethers";
import { ChainService } from "../chain/chain.service";
import { ConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";

const INDEXER_INTERVAL_MS = 10_000;

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private readonly contract: ethers.Contract;
  private readonly provider: ethers.JsonRpcProvider;
  private fromBlock: number;
  private running = false;
  private interval?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chainService: ChainService,
    private readonly configService: ConfigService
  ) {
    const config = this.configService.get();
    this.fromBlock = config.START_BLOCK;
    this.contract = this.chainService.getReadContract();
    this.provider = this.chainService.getProvider();
  }

  start() {
    if (this.interval) {
      return;
    }
    this.poll().catch((error) => this.logger.error(error));
    this.interval = setInterval(() => {
      this.poll().catch((error) => this.logger.error(error));
    }, INDEXER_INTERVAL_MS);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async poll() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const latest = await this.provider.getBlockNumber();
      if (latest < this.fromBlock) {
        return;
      }

      const from = this.fromBlock;
      const to = latest;

      await this.handleDisputeCreated(from, to);
      await this.handleVoted(from, to);
      await this.handleFinalized(from, to);

      this.fromBlock = to + 1;
    } finally {
      this.running = false;
    }
  }

  private async handleDisputeCreated(fromBlock: number, toBlock: number) {
    const events = await this.contract.queryFilter(
      this.contract.filters.DisputeCreated(),
      fromBlock,
      toBlock
    );

    for (const event of events) {
      const parsed = this.parseEvent(event);
      if (!parsed || parsed.name !== "DisputeCreated") {
        continue;
      }
      const disputeId = parsed.args.disputeId as bigint | undefined;
      const deadline = parsed.args.deadline as bigint | undefined;
      if (!disputeId || !deadline) {
        continue;
      }

      const dispute = await this.prisma.dispute.findFirst({
        where: { contractDisputeId: disputeId }
      });

      if (!dispute) {
        this.logger.warn(`DisputeCreated for unknown disputeId=${disputeId.toString()}`);
        continue;
      }

      await this.prisma.dispute.update({
        where: { id: dispute.id },
        data: {
          deadline: new Date(Number(deadline) * 1000),
          status: DisputeStatus.VOTING
        }
      });
    }
  }

  private async handleVoted(fromBlock: number, toBlock: number) {
    const events = await this.contract.queryFilter(this.contract.filters.Voted(), fromBlock, toBlock);

    for (const event of events) {
      const parsed = this.parseEvent(event);
      if (!parsed || parsed.name !== "Voted") {
        continue;
      }
      const disputeId = parsed.args.disputeId as bigint | undefined;
      const voter = parsed.args.voter as string | undefined;
      const choice = parsed.args.choice as bigint | number | undefined;
      if (!disputeId || !voter || choice === undefined) {
        continue;
      }

      const dispute = await this.prisma.dispute.findFirst({
        where: { contractDisputeId: disputeId }
      });

      if (!dispute) {
        this.logger.warn(`Voted for unknown disputeId=${disputeId.toString()}`);
        continue;
      }

      const normalizedVoter = voter.toLowerCase();
      const choiceNumber = Number(choice);
      if (choiceNumber !== 1 && choiceNumber !== 2) {
        continue;
      }

      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const existing = await tx.vote.findUnique({
          where: { disputeId_voter: { disputeId: dispute.id, voter: normalizedVoter } }
        });
        if (existing) {
          return;
        }

        await tx.vote.create({
          data: {
            disputeId: dispute.id,
            voter: normalizedVoter,
            choice: choiceNumber,
            txHash: event.transactionHash ?? "",
            blockNumber: event.blockNumber ?? 0
          }
        });

        await tx.dispute.update({
          where: { id: dispute.id },
          data: {
            votesAgent: choiceNumber === 1 ? { increment: 1 } : undefined,
            votesUser: choiceNumber === 2 ? { increment: 1 } : undefined
          }
        });
      });
    }
  }

  private async handleFinalized(fromBlock: number, toBlock: number) {
    const events = await this.contract.queryFilter(
      this.contract.filters.DisputeFinalized(),
      fromBlock,
      toBlock
    );

    for (const event of events) {
      const parsed = this.parseEvent(event);
      if (!parsed || parsed.name !== "DisputeFinalized") {
        continue;
      }
      const disputeId = parsed.args.disputeId as bigint | undefined;
      const resultValue = parsed.args.result as bigint | number | undefined;
      const votesAgent = parsed.args.votesAgent as bigint | undefined;
      const votesUser = parsed.args.votesUser as bigint | undefined;
      if (!disputeId || resultValue === undefined) {
        continue;
      }

      const dispute = await this.prisma.dispute.findFirst({
        where: { contractDisputeId: disputeId }
      });

      if (!dispute) {
        this.logger.warn(`DisputeFinalized for unknown disputeId=${disputeId.toString()}`);
        continue;
      }

      const result = this.mapResult(Number(resultValue));
      await this.prisma.dispute.update({
        where: { id: dispute.id },
        data: {
          status: DisputeStatus.RESOLVED,
          result,
          votesAgent: votesAgent !== undefined ? Number(votesAgent) : dispute.votesAgent,
          votesUser: votesUser !== undefined ? Number(votesUser) : dispute.votesUser,
          finalizeTxHash: event.transactionHash ?? dispute.finalizeTxHash,
          callbackStatus: dispute.callbackStatus === CallbackStatus.SENT ? undefined : CallbackStatus.PENDING
        }
      });
    }
  }

  private mapResult(resultValue: number): DisputeResult {
    if (resultValue === 1) {
      return DisputeResult.SUPPORT_AGENT;
    }
    return DisputeResult.SUPPORT_USER;
  }

  private parseEvent(event: ethers.Log | ethers.EventLog) {
    try {
      return this.chainService.getInterface().parseLog(event);
    } catch {
      return null;
    }
  }
}
