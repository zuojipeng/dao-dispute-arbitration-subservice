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
    
    // 验证平台是否存在并获取平台配置
    const platform = await this.prisma.platform.findUnique({
      where: { id: input.platformId }
    });

    if (!platform) {
      throw new BadRequestException(`Platform with id '${input.platformId}' not found`);
    }

    // 使用平台配置的代币合约和最小余额
    const tokenAddress = platform.tokenContract;
    const minBalance = platform.minBalance;

    let dispute: any;
    let isNewDispute = false;

    try {
      // 阶段1：原子性占位（利用 platformDisputeId 唯一约束）
      // 同时检查是否已存在相同platformId和platformDisputeId的组合（幂等性）
      const existing = await this.prisma.dispute.findUnique({
        where: { platformDisputeId: input.platformDisputeId },
        include: { platform: true }
      });

      if (existing) {
        // 如果已存在且platformId匹配，直接返回
        if (existing.platformId === input.platformId) {
          if (existing.status !== DisputeStatus.CREATING) {
            this.logger.log(`Dispute ${input.platformDisputeId} already exists`);
            return this.formatDispute(existing);
          }
          // 仍在CREATING状态，等待完成
          for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const updated = await this.prisma.dispute.findUnique({
              where: { platformDisputeId: input.platformDisputeId },
              include: { platform: true }
            });
            if (updated && updated.status !== DisputeStatus.CREATING) {
              return this.formatDispute(updated);
            }
          }
          throw new BadRequestException(
            `Dispute creation timeout for ${input.platformDisputeId}. Please try again later.`
          );
        } else {
          // platformId不匹配，返回错误
          throw new BadRequestException(
            `Dispute with platformDisputeId '${input.platformDisputeId}' already exists with different platformId`
          );
        }
      }

      dispute = await this.prisma.dispute.create({
        data: {
          platformId: input.platformId,
          platformDisputeId: input.platformDisputeId,
          // 业务信息不再存储，使用默认值（数据库schema要求这些字段必填）
          jobId: "",
          billId: "",
          agentId: "",
          initiator: "",
          reason: "",
          evidenceUri: null,
          chainId: config.CHAIN_ID,
          contractAddress: config.VOTING_CONTRACT,
          contractDisputeId: 0n,  // 占位值，等待链上创建
          deadline: new Date(0),   // 占位值，等待链上返回
          status: DisputeStatus.CREATING,  // 占位状态
          tokenAddress: tokenAddress,
          minBalance: minBalance
        },
        include: { platform: true }
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
            where: { platformDisputeId: input.platformDisputeId },
            include: { platform: true }
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
        },
        include: { platform: true }
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

  async listDisputes(status?: DisputeStatus, platformId?: string, page = 1, pageSize = 20) {
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

    // 添加平台过滤
    if (platformId) {
      whereClause.platformId = platformId;
    }

    const disputes = await this.prisma.dispute.findMany({
      where: whereClause,
      include: { platform: true },
      orderBy: { deadline: "asc" },
      skip,
      take
    });

    return disputes.map((dispute: any) => this.formatDispute(dispute));
  }

  async getDispute(platformDisputeId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { platformDisputeId },
      include: { platform: true }
    });
    return dispute ? this.formatDispute(dispute) : null;
  }

  async vote(platformDisputeId: string, input: VoteInput) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { platformDisputeId },
      include: { platform: true }
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

    // 动态查找平台配置
    // 优先使用平台配置，否则使用争议存储的配置，最后使用默认配置
    let tokenAddress: string;
    let minBalance: bigint;

    if (dispute.platform) {
      // 使用平台配置
      tokenAddress = dispute.tokenAddress || dispute.platform.tokenContract;
      minBalance = BigInt(dispute.minBalance || dispute.platform.minBalance);
      this.logger.debug(
        `Using platform config for voting: platformId=${dispute.platform.id}, tokenAddress=${tokenAddress}, minBalance=${minBalance}`
      );
    } else {
      // 向后兼容：使用争议存储的配置或默认配置
      const config = this.configService.get();
      const defaultConfig = this.configService.getDefaultPlatformConfig();
      tokenAddress = dispute.tokenAddress || defaultConfig.tokenContract;
      minBalance = BigInt(dispute.minBalance || defaultConfig.minBalance);
      this.logger.debug(
        `Using default config for voting: tokenAddress=${tokenAddress}, minBalance=${minBalance}`
      );
    }

    // 验证代币合约地址格式
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      throw new BadRequestException(
        `Invalid token contract address: ${tokenAddress}. Token address must be a valid 40-character hex address starting with 0x.`
      );
    }

    this.logger.debug(
      `Checking balance for voter ${input.voter} in token contract ${tokenAddress}`
    );

    let balance: bigint;
    try {
      balance = await this.chainService.getTokenBalance(tokenAddress, input.voter);
    } catch (error: any) {
      this.logger.error(
        `Failed to get token balance: tokenAddress=${tokenAddress}, voter=${input.voter}, error=${error.message}`
      );
      
      // 如果返回的是解码错误，说明合约地址可能无效
      if (error.code === 'BAD_DATA' || error.message?.includes('could not decode result data')) {
        throw new BadRequestException(
          `Invalid token contract address: ${tokenAddress}. The contract does not exist or is not an ERC20 token. Please check the platform configuration.`
        );
      }
      
      // 其他错误原样抛出
      throw new BadRequestException(
        `Failed to query token balance: ${error.message}. Please check the token contract address and RPC connection.`
      );
    }

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
      where: { platformDisputeId },
      include: { platform: true }
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
        where: { platformDisputeId },
        include: { platform: true }
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
    // 只返回投票相关信息，不返回业务信息
    return {
      platformDisputeId: dispute.platformDisputeId,
      platformId: dispute.platformId,
      contractDisputeId: dispute.contractDisputeId.toString(),
      deadline: dispute.deadline.toISOString(),
      status: dispute.status,
      result: dispute.result,
      votesAgent: dispute.votesAgent,
      votesUser: dispute.votesUser,
      finalizeTxHash: dispute.finalizeTxHash,
      tokenAddress: dispute.tokenAddress,
      minBalance: dispute.minBalance,
      createdAt: dispute.createdAt.toISOString(),
      updatedAt: dispute.updatedAt.toISOString()
    };
  }
}
