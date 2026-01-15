import { Injectable } from "@nestjs/common";
import { AppConfig, configSchema } from "./config.schema";

@Injectable()
export class ConfigService {
  private readonly config: AppConfig;

  constructor() {
    const parsed = configSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    this.config = parsed.data;
  }

  get(): AppConfig {
    return this.config;
  }
}
