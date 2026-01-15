import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import crypto from "node:crypto";
import { ConfigService } from "../config/config.service";
import { NonceService } from "./nonce.service";

const MAX_DRIFT_SECONDS = 300;

@Injectable()
export class HmacGuard implements CanActivate {
  constructor(private readonly configService: ConfigService, private readonly nonceService: NonceService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.header("x-signature");
    const timestamp = request.header("x-timestamp");
    const nonce = request.header("x-nonce");

    if (!signature || !timestamp || !nonce) {
      throw new UnauthorizedException("Missing HMAC headers");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      throw new UnauthorizedException("Invalid timestamp");
    }
    if (Math.abs(nowSeconds - ts) > MAX_DRIFT_SECONDS) {
      throw new UnauthorizedException("Timestamp drift too large");
    }

    if (this.nonceService.has(nonce)) {
      throw new UnauthorizedException("Nonce already used");
    }

    const rawBody = request.rawBody ?? JSON.stringify(request.body ?? {});
    const payload = `${timestamp}.${nonce}.${rawBody}`;
    const secret = this.configService.get().HMAC_SECRET;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    const expectedBuffer = Buffer.from(expected, "utf8");
    const receivedBuffer = Buffer.from(signature, "utf8");
    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new UnauthorizedException("Invalid signature");
    }

    this.nonceService.add(nonce, MAX_DRIFT_SECONDS);
    return true;
  }
}
