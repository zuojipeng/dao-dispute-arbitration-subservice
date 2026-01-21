import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ConfigModule } from "../config/config.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PlatformsController } from "./platforms.controller";
import { PlatformsService } from "./platforms.service";

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule],
  controllers: [PlatformsController],
  providers: [PlatformsService],
  exports: [PlatformsService]
})
export class PlatformsModule {}

