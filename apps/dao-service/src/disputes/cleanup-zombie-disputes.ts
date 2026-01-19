import { Injectable, Logger } from "@nestjs/common";
import { DisputeStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * 清理僵尸争议记录
 * 
 * 僵尸记录的产生场景：
 * 1. 服务在创建链上争议时崩溃，导致 CREATING 状态的记录永久残留
 * 2. 链上交易超时未确认，占位记录未被清理
 * 
 * 建议：
 * - 定期运行此脚本（如每小时一次）
 * - 或在服务启动时运行一次
 * - 或作为 cron job 在 worker 中定期执行
 */
@Injectable()
export class ZombieDisputeCleanup {
  private readonly logger = new Logger(ZombieDisputeCleanup.name);
  
  // 超过此时间的 CREATING 状态记录被视为僵尸记录
  private readonly ZOMBIE_THRESHOLD_MINUTES = 10;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 清理超时的 CREATING 状态记录
   * 
   * @returns 清理的记录数量
   */
  async cleanupZombieDisputes(): Promise<number> {
    const thresholdDate = new Date(
      Date.now() - this.ZOMBIE_THRESHOLD_MINUTES * 60 * 1000
    );

    try {
      // 查找超时的 CREATING 状态记录
      const zombieDisputes = await this.prisma.dispute.findMany({
        where: {
          status: DisputeStatus.CREATING,
          createdAt: {
            lt: thresholdDate
          }
        },
        select: {
          id: true,
          platformDisputeId: true,
          createdAt: true
        }
      });

      if (zombieDisputes.length === 0) {
        this.logger.debug('No zombie disputes found');
        return 0;
      }

      this.logger.warn(
        `Found ${zombieDisputes.length} zombie disputes (CREATING > ${this.ZOMBIE_THRESHOLD_MINUTES}min)`
      );

      // 删除僵尸记录
      const result = await this.prisma.dispute.deleteMany({
        where: {
          id: {
            in: zombieDisputes.map((d: any) => d.id)
          }
        }
      });

      this.logger.log(
        `Cleaned up ${result.count} zombie disputes: ${zombieDisputes.map((d: any) => d.platformDisputeId).join(', ')}`
      );

      return result.count;
    } catch (error: any) {
      this.logger.error(`Failed to cleanup zombie disputes: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取当前僵尸记录统计
   */
  async getZombieStats(): Promise<{
    count: number;
    oldestCreatedAt: Date | null;
  }> {
    const thresholdDate = new Date(
      Date.now() - this.ZOMBIE_THRESHOLD_MINUTES * 60 * 1000
    );

    const zombies = await this.prisma.dispute.findMany({
      where: {
        status: DisputeStatus.CREATING,
        createdAt: {
          lt: thresholdDate
        }
      },
      select: {
        createdAt: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return {
      count: zombies.length,
      oldestCreatedAt: zombies.length > 0 ? zombies[0].createdAt : null
    };
  }
}

