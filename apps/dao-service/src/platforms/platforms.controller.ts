import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards
} from "@nestjs/common";
import { HmacGuard } from "../auth/hmac.guard";
import { createPlatformSchema, updatePlatformSchema } from "./platforms.dto";
import { PlatformsService } from "./platforms.service";

@Controller("v1/platforms")
export class PlatformsController {
  constructor(private readonly platformsService: PlatformsService) {}

  @Post()
  @UseGuards(HmacGuard)
  async create(@Body() body: unknown) {
    const input = createPlatformSchema.parse(body);
    return this.platformsService.create(input);
  }

  @Get()
  async findAll() {
    return this.platformsService.findAll();
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.platformsService.findOne(id);
  }

  @Put(":id")
  @UseGuards(HmacGuard)
  async update(@Param("id") id: string, @Body() body: unknown) {
    const input = updatePlatformSchema.parse(body);
    return this.platformsService.update(id, input);
  }

  @Delete(":id")
  @UseGuards(HmacGuard)
  async remove(@Param("id") id: string) {
    return this.platformsService.remove(id);
  }
}


