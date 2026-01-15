import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CallbacksProcessor } from "../callbacks/callbacks.processor";
import { FinalizerService } from "../finalizer/finalizer.service";
import { IndexerService } from "../indexer/indexer.service";

@Injectable()
export class WorkerRunner implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly indexer: IndexerService,
    private readonly finalizer: FinalizerService,
    private readonly callbacks: CallbacksProcessor
  ) {}

  onModuleInit() {
    this.indexer.start();
    this.finalizer.start();
    this.callbacks.start();
  }

  onModuleDestroy() {
    this.indexer.stop();
    this.finalizer.stop();
    this.callbacks.stop();
  }
}
