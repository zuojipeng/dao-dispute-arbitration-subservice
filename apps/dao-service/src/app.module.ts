import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CallbacksModule } from "./callbacks/callbacks.module";
import { ChainModule } from "./chain/chain.module";
import { ConfigModule } from "./config/config.module";
import { DisputesModule } from "./disputes/disputes.module";
import { PlatformsModule } from "./platforms/platforms.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [ConfigModule, PrismaModule, DisputesModule, PlatformsModule, ChainModule, CallbacksModule, AuthModule]
})
export class AppModule {}
