import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePlatformInput, UpdatePlatformInput } from "./platforms.dto";

@Injectable()
export class PlatformsService {
  private readonly logger = new Logger(PlatformsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建新平台
   */
  async create(input: CreatePlatformInput) {
    // 检查平台ID是否已存在
    const existing = await this.prisma.platform.findUnique({
      where: { id: input.id }
    });

    if (existing) {
      throw new ConflictException(`Platform with id '${input.id}' already exists`);
    }

    try {
      const platform = await this.prisma.platform.create({
        data: {
          id: input.id,
          name: input.name,
          tokenContract: input.tokenContract.toLowerCase(),
          minBalance: input.minBalance,
          chainId: input.chainId,
          description: input.description,
          webhookUrl: input.webhookUrl
        }
      });

      this.logger.log(`Created platform: ${platform.id}`);
      return this.formatPlatform(platform);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Platform with id '${input.id}' already exists`);
      }
      throw error;
    }
  }

  /**
   * 查询单个平台
   */
  async findOne(id: string) {
    const platform = await this.prisma.platform.findUnique({
      where: { id }
    });

    if (!platform) {
      throw new NotFoundException(`Platform with id '${id}' not found`);
    }

    return this.formatPlatform(platform);
  }

  /**
   * 查询所有平台
   */
  async findAll() {
    const platforms = await this.prisma.platform.findMany({
      orderBy: { createdAt: 'desc' }
    });

    return platforms.map((platform: {
      id: string;
      name: string;
      tokenContract: string;
      minBalance: string;
      chainId: number;
      description: string | null;
      webhookUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
    }) => this.formatPlatform(platform));
  }

  /**
   * 更新平台配置
   */
  async update(id: string, input: UpdatePlatformInput) {
    // 检查平台是否存在
    const existing = await this.prisma.platform.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new NotFoundException(`Platform with id '${id}' not found`);
    }

    // 构建更新数据
    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.tokenContract !== undefined) updateData.tokenContract = input.tokenContract.toLowerCase();
    if (input.minBalance !== undefined) updateData.minBalance = input.minBalance;
    if (input.chainId !== undefined) updateData.chainId = input.chainId;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.webhookUrl !== undefined) updateData.webhookUrl = input.webhookUrl;

    const platform = await this.prisma.platform.update({
      where: { id },
      data: updateData
    });

    this.logger.log(`Updated platform: ${platform.id}`);
    return this.formatPlatform(platform);
  }

  /**
   * 删除平台（软删除，取消关联）
   */
  async remove(id: string) {
    const existing = await this.prisma.platform.findUnique({
      where: { id },
      include: { disputes: true }
    });

    if (!existing) {
      throw new NotFoundException(`Platform with id '${id}' not found`);
    }

    // 检查是否有争议关联
    if (existing.disputes.length > 0) {
      throw new BadRequestException(
        `Cannot delete platform '${id}' because it has ${existing.disputes.length} associated disputes`
      );
    }

    await this.prisma.platform.delete({
      where: { id }
    });

    this.logger.log(`Deleted platform: ${id}`);
    return { id, deleted: true };
  }

  /**
   * 格式化平台数据
   */
  private formatPlatform(platform: {
    id: string;
    name: string;
    tokenContract: string;
    minBalance: string;
    chainId: number;
    description: string | null;
    webhookUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: platform.id,
      name: platform.name,
      tokenContract: platform.tokenContract,
      minBalance: platform.minBalance,
      chainId: platform.chainId,
      description: platform.description,
      webhookUrl: platform.webhookUrl,
      createdAt: platform.createdAt.toISOString(),
      updatedAt: platform.updatedAt.toISOString()
    };
  }
}

