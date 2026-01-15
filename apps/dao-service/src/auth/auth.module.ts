import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { HmacGuard } from "./hmac.guard";
import { NonceService } from "./nonce.service";

@Module({
  imports: [ConfigModule],
  providers: [HmacGuard, NonceService],
  exports: [HmacGuard, NonceService]
})
export class AuthModule {}
