import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { json, type Request, type Response } from "express";
import { AppModule } from "./app.module";
import { ConfigService } from "./config/config.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ["log", "error", "warn"] });
  app.use(
    json({
      verify: (req: Request, _res: Response, buf: Buffer) => {
        (req as any).rawBody = buf?.toString("utf8") ?? "";
      }
    })
  );
  const config = app.get(ConfigService).get();
  const port = config.PORT ?? 3000;

  await app.listen(port);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
