import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CallbacksProcessor } from "../callbacks/callbacks.processor";
import { FinalizerService } from "../finalizer/finalizer.service";
import { IndexerService } from "../indexer/indexer.service";

@Injectable()
export class WorkerRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRunner.name);

  constructor(
    private readonly indexer: IndexerService,
    private readonly finalizer: FinalizerService,
    private readonly callbacks: CallbacksProcessor
  ) {}

  async onModuleInit() {
    this.logger.log('Starting all workers...');
    
    try {
      // 启动所有 Worker（并行）
      await Promise.all([
        this.indexer.start(),
        this.finalizer.start(),
        this.callbacks.start()
      ]);
      
      this.logger.log('All workers started successfully');
    } catch (error) {
      this.logger.error(`Failed to start workers: ${error}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Gracefully shutting down workers...');
    
    try {
      // 停止所有 Worker（并行）
      await Promise.all([
        this.indexer.stop(),
        this.finalizer.stop(),
        this.callbacks.stop()
      ]);
      
      this.logger.log('All workers stopped gracefully');
    } catch (error) {
      this.logger.error(`Error during worker shutdown: ${error}`);
      // 不抛出错误，允许进程退出
    }
  }
}
