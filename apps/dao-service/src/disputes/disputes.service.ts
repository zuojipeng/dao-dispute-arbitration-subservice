import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { DisputeStatus } from "@prisma/client";
import { ChainService } from "../chain/chain.service";
import { ConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDisputeInput, VoteInput } from "./disputes.dto";

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chainService: ChainService,
    private readonly configService: ConfigService
  ) {}

  /**
   * 创建争议（支持并发安全和幂等性）
   * 
   * 采用两阶段提交策略：
   * 1. 阶段一：在数据库中创建 CREATING 状态的占位记录（利用唯一约束防止并发）
   * 2. 阶段二：调用链上合约创建争议，然后更新为 VOTING 状态
   * 
   * 如果发生并发冲突，会等待第一个请求完成并返回其结果
   */
  async createDispute(input: CreateDisputeInput) {
    const config = this.configService.get();
    const minBalance = this.configService.getMinBalance(input.tokenAddress);

    let dispute: any;
    let isNewDispute = false;

    try {
      // 阶段1：原子性占位（利用 platformDisputeId 唯一约束）
      dispute = await this.prisma.dispute.create({
        data: {
          platformDisputeId: input.platformDisputeId,
          jobId: input.jobId,
          billId: input.billId,
          agentId: input.agentId,
          initiator: input.initiator,
          reason: input.reason,
          evidenceUri: input.evidenceUri,
          chainId: config.CHAIN_ID,
          contractAddress: config.VOTING_CONTRACT,
          contractDisputeId: 0n,  // 占位值，等待链上创建
          deadline: new Date(0),   // 占位值，等待链上返回
          status: DisputeStatus.CREATING,  // 占位状态
          tokenAddress: input.tokenAddress,
          minBalance: minBalance
        }
      });
      isNewDispute = true;
      this.logger.log(`Created placeholder for dispute ${input.platformDisputeId}`);
    } catch (error: any) {
      // 处理唯一约束冲突（说明已有其他请求在处理或已完成）
      if (error.code === 'P2002') {
        this.logger.log(`Dispute ${input.platformDisputeId} already exists, waiting for completion`);
        
        // 等待并查询最终结果（带重试逻辑，最多等待 10 秒）
        for (let i = 0; i < 20; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const existing = await this.prisma.dispute.findUnique({
            where: { platformDisputeId: input.platformDisputeId }
          });
          
          if (existing) {
            if (existing.status !== DisputeStatus.CREATING) {
              // 第一个请求已完成，返回结果
              this.logger.log(`Dispute ${input.platformDisputeId} completed by another request`);
              return this.formatDispute(existing);
            }
            // 仍在 CREATING 状态，继续等待
          }
        }
        
        // 超时仍未完成，返回错误
        throw new BadRequestException(
          `Dispute creation timeout for ${input.platformDisputeId}. Please try again later.`
        );
      }
      
      // 其他数据库错误，直接抛出
      throw error;
    }

    // 只有成功创建占位记录的请求才会执行到这里
    try {
      // 阶段2：调用链上合约创建争议
      this.logger.log(`Calling chain service to create dispute ${input.platformDisputeId}`);
      const { disputeId, deadline } = await this.chainService.createDispute(
        input.platformDisputeId
      );
      const deadlineDate = new Date(Number(deadline) * 1000);

      // 阶段3：更新为最终状态
      dispute = await this.prisma.dispute.update({
        where: { id: dispute.id },
        data: {
          contractDisputeId: disputeId,
          deadline: deadlineDate,
          status: DisputeStatus.VOTING
        }
      });

      this.logger.log(
        `Dispute ${input.platformDisputeId} created successfully with contractDisputeId ${disputeId}`
      );
      return this.formatDispute(dispute);
    } catch (error: any) {
      // 链上调用失败，删除占位记录以允许重试
      this.logger.error(
        `Failed to create dispute on chain for ${input.platformDisputeId}: ${error.message}`
      );
      
      if (isNewDispute && dispute?.id) {
        await this.prisma.dispute.delete({
          where: { id: dispute.id }
        }).catch((deleteError: any) => {
          this.logger.error(`Failed to cleanup placeholder: ${deleteError.message}`);
        });
      }
      
      throw error;
    }
  }

  async listDisputes(status?: DisputeStatus, page = 1, pageSize = 20) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = Math.max(page - 1, 0) * take;

    // 过滤条件：排除 CREATING 状态（占位记录不应该对外暴露）
    const whereClause: any = {};
    
    if (status) {
      whereClause.status = status;
    } else {
      // 如果没有指定状态，排除 CREATING 状态
      whereClause.status = {
        in: [DisputeStatus.VOTING, DisputeStatus.RESOLVED]
      };
    }

    const disputes = await this.prisma.dispute.findMany({
      where: whereClause,
      orderBy: { deadline: "asc" },
      skip,
      take
    });

    return disputes.map((dispute: any) => this.formatDispute(dispute));
  }

  async getDispute(platformDisputeId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { platformDisputeId }
    });
    return dispute ? this.formatDispute(dispute) : null;
  }

  async vote(platformDisputeId: string, input: VoteInput) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { platformDisputeId }
    });

    if (!dispute || dispute.status !== DisputeStatus.VOTING) {
      throw new BadRequestException("Dispute not found or not in voting");
    }

    const existingVote = await this.prisma.vote.findUnique({
      where: {
        disputeId_voter: {
          disputeId: dispute.id,
          voter: input.voter.toLowerCase()
        }
      }
    });

    if (existingVote) {
      throw new BadRequestException("Already voted");
    }

    const config = this.configService.get();
    const tokenAddress = dispute.tokenAddress || config.TOKEN_CONTRACT;
    const minBalance = BigInt(dispute.minBalance || config.MIN_BALANCE);

    const balance = await this.chainService.getTokenBalance(tokenAddress, input.voter);

    if (balance < minBalance) {
      throw new BadRequestException("Insufficient balance");
    }

    const tx = await this.chainService.voteOnBehalf(
      dispute.contractDisputeId,
      input.voter,
      input.choice
    );
    const receipt = await this.chainService.waitForTransaction(tx);

    await this.prisma.vote.create({
      data: {
        disputeId: dispute.id,
        voter: input.voter.toLowerCase(),
        choice: input.choice,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber
      }
    });

    return { txHash: receipt.hash };
  }

  /**
   * 强制结束争议（管理员功能，支持并发安全）
   * 
   * 使用乐观锁策略：先标记为 RESOLVED 状态，再调用链上合约
   * 如果发生并发冲突，第二个请求会直接返回已完成状态
   */
  async forceFinalize(platformDisputeId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { platformDisputeId }
    });
    
    if (!dispute) {
      return null;
    }

    // 如果已经是 RESOLVED 状态，直接返回
    if (dispute.status === DisputeStatus.RESOLVED) {
      this.logger.log(`Dispute ${platformDisputeId} already finalized`);
      return {
        txHash: dispute.finalizeTxHash,
        contractDisputeId: dispute.contractDisputeId.toString(),
        alreadyFinalized: true
      };
    }

    // 使用 updateMany + 状态条件实现乐观锁
    // 只有当 status = VOTING 时才会更新成功
    const updated = await this.prisma.dispute.updateMany({
      where: {
        platformDisputeId,
        status: DisputeStatus.VOTING  // 乐观锁条件
      },
      data: {
        status: DisputeStatus.RESOLVED,
        finalizeTxHash: 'PENDING'  // 临时标记
      }
    });

    // 如果更新失败（count = 0），说明已被其他请求处理
    if (updated.count === 0) {
      this.logger.log(`Dispute ${platformDisputeId} already being finalized by another request`);
      
      // 重新查询获取最新状态
      const updatedDispute = await this.prisma.dispute.findUnique({
        where: { platformDisputeId }
      });
      
      return {
        txHash: updatedDispute?.finalizeTxHash || null,
        contractDisputeId: dispute.contractDisputeId.toString(),
        alreadyFinalized: true
      };
    }

    try {
      // 调用链上合约 finalize
      this.logger.log(`Force finalizing dispute ${platformDisputeId} on chain`);
      const tx = await this.chainService.forceFinalizeDispute(dispute.contractDisputeId);
      const receipt = await this.chainService.waitForTransaction(tx);

      // 更新真实的 txHash
      await this.prisma.dispute.update({
        where: { platformDisputeId },
        data: {
          finalizeTxHash: receipt.hash
        }
      });

      this.logger.log(`Dispute ${platformDisputeId} finalized successfully with tx ${receipt.hash}`);
      return {
        txHash: receipt.hash,
        contractDisputeId: dispute.contractDisputeId.toString(),
        alreadyFinalized: false
      };
    } catch (error: any) {
      // 链上调用失败，回滚状态
      this.logger.error(`Failed to finalize dispute ${platformDisputeId}: ${error.message}`);
      
      await this.prisma.dispute.update({
        where: { platformDisputeId },
        data: {
          status: DisputeStatus.VOTING,
          finalizeTxHash: null
        }
      }).catch((rollbackError: any) => {
        this.logger.error(`Failed to rollback dispute status: ${rollbackError.message}`);
      });
      
      throw error;
    }
  }

  private formatDispute(dispute: any) {
    return {
      id: dispute.id,
      platformDisputeId: dispute.platformDisputeId,
      jobId: dispute.jobId,
      billId: dispute.billId,
      agentId: dispute.agentId,
      initiator: dispute.initiator,
      reason: dispute.reason,
      evidenceUri: dispute.evidenceUri,
      chainId: dispute.chainId,
      contractAddress: dispute.contractAddress,
      contractDisputeId: dispute.contractDisputeId.toString(),
      deadline: dispute.deadline.toISOString(),
      status: dispute.status,
      result: dispute.result,
      votesAgent: dispute.votesAgent,
      votesUser: dispute.votesUser,
      finalizeTxHash: dispute.finalizeTxHash,
      callbackStatus: dispute.callbackStatus,
      tokenAddress: dispute.tokenAddress,
      minBalance: dispute.minBalance
    };
  }
}
