import { BadRequestException, Injectable } from "@nestjs/common";
import { DisputeStatus } from "@prisma/client";
import { ChainService } from "../chain/chain.service";
import { ConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDisputeInput, VoteInput } from "./disputes.dto";

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chainService: ChainService,
    private readonly configService: ConfigService
  ) {}

  async createDispute(input: CreateDisputeInput) {
    const existing = await this.prisma.dispute.findUnique({
      where: { platformDisputeId: input.platformDisputeId }
    });

    if (existing) {
      return this.formatDispute(existing);
    }

    const { disputeId, deadline } = await this.chainService.createDispute(input.platformDisputeId);
    const config = this.configService.get();
    const deadlineDate = new Date(Number(deadline) * 1000);

    const minBalance = this.configService.getMinBalance(input.tokenAddress);

    const created = await this.prisma.dispute.create({
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
        contractDisputeId: disputeId,
        deadline: deadlineDate,
        status: DisputeStatus.VOTING,
        tokenAddress: input.tokenAddress,
        minBalance: minBalance
      }
    });

    return this.formatDispute(created);
  }

  async listDisputes(status?: DisputeStatus, page = 1, pageSize = 20) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = Math.max(page - 1, 0) * take;

    const disputes = await this.prisma.dispute.findMany({
      where: status ? { status } : undefined,
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
    const receipt = await tx.wait();

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

  async forceFinalize(platformDisputeId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { platformDisputeId }
    });
    if (!dispute) {
      return null;
    }

    if (dispute.status === DisputeStatus.RESOLVED) {
      return {
        txHash: dispute.finalizeTxHash,
        contractDisputeId: dispute.contractDisputeId.toString(),
        alreadyFinalized: true
      };
    }

    const tx = await this.chainService.forceFinalizeDispute(dispute.contractDisputeId);
    const receipt = await tx.wait();

    return {
      txHash: receipt?.hash ?? tx.hash,
      contractDisputeId: dispute.contractDisputeId.toString(),
      alreadyFinalized: false
    };
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
