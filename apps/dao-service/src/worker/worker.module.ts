import { Module } from "@nestjs/common";
import { CallbacksModule } from "../callbacks/callbacks.module";
import { ChainModule } from "../chain/chain.module";
import { ConfigModule } from "../config/config.module";
import { FinalizerService } from "../finalizer/finalizer.service";
import { IndexerService } from "../indexer/indexer.service";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkerRunner } from "./worker.runner";

@Module({
  imports: [ConfigModule, PrismaModule, ChainModule, CallbacksModule],
  providers: [IndexerService, FinalizerService, WorkerRunner]
})
export class WorkerModule {}
