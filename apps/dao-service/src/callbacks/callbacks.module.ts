import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { PrismaModule } from "../prisma/prisma.module";
import { CallbacksProcessor } from "./callbacks.processor";
import { CallbacksService } from "./callbacks.service";

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [CallbacksService, CallbacksProcessor],
  exports: [CallbacksService, CallbacksProcessor]
})
export class CallbacksModule {}
