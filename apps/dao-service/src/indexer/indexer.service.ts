import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { CallbackStatus, DisputeResult, DisputeStatus, Prisma } from "@prisma/client";
import { ethers } from "ethers";
import { ChainService } from "../chain/chain.service";
import { ConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";

const INDEXER_INTERVAL_MS = 10_000;
const MAX_BLOCKS_PER_BATCH = 1000;  // 每批最多处理 1000 个区块
const CONFIRMATIONS = 1;             // 等待确认数（生产环境建议 6，本地测试可设为 0-1）

@Injectable()
export class IndexerService implements OnModuleInit {
  private readonly logger = new Logger(IndexerService.name);
  private readonly contract: ethers.Contract;
  private readonly provider: ethers.JsonRpcProvider;
  private fromBlock: number;
  private running = false;
  private interval?: NodeJS.Timeout;
  private initialized = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chainService: ChainService,
    private readonly configService: ConfigService
  ) {
    const config = this.configService.get();
    this.fromBlock = config.START_BLOCK;  // 默认值，会被 checkpoint 覆盖
    this.contract = this.chainService.getReadContract();
    this.provider = this.chainService.getProvider();
  }

  /**
   * 模块初始化时加载 checkpoint
   */
  async onModuleInit() {
    await this.loadCheckpoint();
    this.initialized = true;
  }

  /**
   * 从数据库加载上次索引的位置
   */
  private async loadCheckpoint() {
    try {
      const checkpoint = await this.prisma.indexerCheckpoint.findUnique({
        where: { id: 'singleton' }
      });

      if (checkpoint) {
        this.fromBlock = checkpoint.lastBlock + 1;  // 从下一个区块开始
        this.logger.log(`Loaded checkpoint: resuming from block ${this.fromBlock}`);
      } else {
        const config = this.configService.get();
        this.fromBlock = config.START_BLOCK;
        this.logger.log(`No checkpoint found, starting from block ${this.fromBlock}`);
      }
    } catch (error) {
      this.logger.error(`Failed to load checkpoint: ${error}`, error instanceof Error ? error.stack : undefined);
      // 失败时使用配置的 START_BLOCK
      const config = this.configService.get();
      this.fromBlock = config.START_BLOCK;
    }
  }

  /**
   * 保存当前索引位置到数据库
   */
  private async saveCheckpoint(blockNumber: number, blockHash?: string) {
    try {
      await this.prisma.indexerCheckpoint.upsert({
        where: { id: 'singleton' },
        update: {
          lastBlock: blockNumber,
          lastBlockHash: blockHash
        },
        create: {
          id: 'singleton',
          lastBlock: blockNumber,
          lastBlockHash: blockHash
        }
      });
    } catch (error) {
      this.logger.error(`Failed to save checkpoint: ${error}`);
      // 不抛出错误，允许索引继续
    }
  }

  async start() {
    if (this.interval) {
      return;
    }

    // 确保已初始化
    if (!this.initialized) {
      await this.loadCheckpoint();
      this.initialized = true;
    }

    this.logger.log('Starting indexer...');
    this.poll().catch((error) => this.logger.error(error));
    this.interval = setInterval(() => {
      this.poll().catch((error) => this.logger.error(error));
    }, INDEXER_INTERVAL_MS);
  }

  async stop() {
    this.logger.log('Stopping indexer...');
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }

    // 等待当前 poll 完成
    let waitCount = 0;
    while (this.running && waitCount < 100) {  // 最多等待 10 秒
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }

    if (this.running) {
      this.logger.warn('Indexer force stopped while still running');
    } else {
      this.logger.log('Indexer stopped gracefully');
    }
  }

  private async poll() {
    if (this.running) {
      this.logger.log('Poll skipped: already running');
      return;
    }
    this.running = true;
    try {
      const latest = await this.provider.getBlockNumber();
      
      // 使用 confirmations 避免 reorg
      const confirmedBlock = Math.max(latest - CONFIRMATIONS, 0);
      
      if (confirmedBlock < this.fromBlock) {
        this.logger.log(`No new confirmed blocks (latest: ${latest}, confirmed: ${confirmedBlock}, from: ${this.fromBlock})`);
        return;
      }

      const from = this.fromBlock;
      const to = confirmedBlock;

      this.logger.log(`Indexing blocks ${from} to ${to} (latest: ${latest}, confirmations: ${CONFIRMATIONS})`);

      // 分批处理，避免 RPC 限制
      for (let batchStart = from; batchStart <= to; batchStart += MAX_BLOCKS_PER_BATCH) {
        const batchEnd = Math.min(batchStart + MAX_BLOCKS_PER_BATCH - 1, to);
        
        try {
          this.logger.log(`Processing batch: blocks ${batchStart}-${batchEnd}`);
          
          await this.handleDisputeCreated(batchStart, batchEnd);
          await this.handleVoted(batchStart, batchEnd);
          await this.handleFinalized(batchStart, batchEnd);

          // 每批处理后保存 checkpoint
          await this.saveCheckpoint(batchEnd);
          this.fromBlock = batchEnd + 1;
          
          this.logger.log(`Batch ${batchStart}-${batchEnd} completed, checkpoint saved`);
        } catch (error) {
          this.logger.error(`Failed to process batch ${batchStart}-${batchEnd}: ${error}`);
          // 停止当前轮次，下次从失败的批次重试
          break;
        }
      }
    } catch (error) {
      this.logger.error(`Indexer poll error: ${error}`, error instanceof Error ? error.stack : undefined);
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
