import { Injectable } from "@nestjs/common";
import { ConfigService } from "../config/config.service";

@Injectable()
export class CallbacksService {
  constructor(private readonly configService: ConfigService) {}

  async sendResolvedCallback(payload: Record<string, unknown>) {
    const url = this.configService.get().PLATFORM_WEBHOOK_URL;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Callback failed with status ${response.status}`);
    }
  }
}
