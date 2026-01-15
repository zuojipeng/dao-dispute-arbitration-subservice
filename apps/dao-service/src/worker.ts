import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker/worker.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["log", "error", "warn"]
  });

  await app.init();
  console.log("Worker initialized");
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
