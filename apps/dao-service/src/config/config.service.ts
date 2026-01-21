import { Injectable } from "@nestjs/common";
import { AppConfig, configSchema } from "./config.schema";

@Injectable()
export class ConfigService {
  private readonly config: AppConfig;
  private readonly minBalanceMap: Map<string, string>;

  constructor() {
    const parsed = configSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    this.config = parsed.data;

    // 解析 MIN_BALANCE_MAP
    this.minBalanceMap = new Map();
    if (this.config.MIN_BALANCE_MAP) {
      try {
        const map = JSON.parse(this.config.MIN_BALANCE_MAP);
        if (typeof map === "object" && map !== null) {
          for (const [tokenAddress, minBalance] of Object.entries(map)) {
            if (typeof tokenAddress === "string" && typeof minBalance === "string") {
              this.minBalanceMap.set(tokenAddress.toLowerCase(), minBalance);
            }
          }
        }
      } catch (error) {
        console.warn("Failed to parse MIN_BALANCE_MAP, using default minBalance only");
      }
    }
  }

  get(): AppConfig {
    return this.config;
  }

  /**
   * 获取指定代币地址的 minBalance
   * @param tokenAddress 代币地址（可选，不传则返回默认值）
   * @returns minBalance 字符串
   */
  getMinBalance(tokenAddress?: string | null): string {
    if (!tokenAddress) {
      return this.config.MIN_BALANCE;
    }
    const normalizedAddress = tokenAddress.toLowerCase();
    return this.minBalanceMap.get(normalizedAddress) || this.config.MIN_BALANCE;
  }

  /**
   * 获取默认平台配置
   * 优先使用 DEFAULT_TOKEN_CONTRACT 和 DEFAULT_MIN_BALANCE
   * 如果没有设置，则使用 TOKEN_CONTRACT 和 MIN_BALANCE（向后兼容）
   * @returns 默认平台配置对象
   */
  getDefaultPlatformConfig(): { tokenContract: string; minBalance: string } {
    return {
      tokenContract: this.config.DEFAULT_TOKEN_CONTRACT || this.config.TOKEN_CONTRACT,
      minBalance: this.config.DEFAULT_MIN_BALANCE || this.config.MIN_BALANCE
    };
  }
}
