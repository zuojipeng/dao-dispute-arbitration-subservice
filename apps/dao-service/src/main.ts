import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { json, type Request, type Response } from "express";
import { AppModule } from "./app.module";
import { ConfigService } from "./config/config.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ["log", "error", "warn"] });
  
  // 配置CORS
  const corsOrigins = process.env.CORS_ORIGINS;
  if (corsOrigins) {
    const allowedOrigins = corsOrigins.split(",").map((origin) => origin.trim());
    app.enableCors({
      origin: allowedOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-timestamp", "x-nonce", "x-signature"],
      credentials: true,
    });
  } else {
    // 如果没有配置，允许所有源（开发环境）
    app.enableCors({
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-timestamp", "x-nonce", "x-signature"],
      credentials: true,
    });
  }
  
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
  console.log(`🚀 DAO Service is running on http://0.0.0.0:${port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
