import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChainModule } from "../chain/chain.module";
import { ConfigModule } from "../config/config.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ZombieDisputeCleanup } from "./cleanup-zombie-disputes";
import { DisputesController } from "./disputes.controller";
import { DisputesService } from "./disputes.service";

@Module({
  imports: [PrismaModule, ChainModule, ConfigModule, AuthModule],
  controllers: [DisputesController],
  providers: [DisputesService, ZombieDisputeCleanup],
  exports: [DisputesService, ZombieDisputeCleanup]
})
export class DisputesModule {}
