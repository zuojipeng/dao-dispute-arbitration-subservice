import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { DisputeStatus } from "@prisma/client";
import { HmacGuard } from "../auth/hmac.guard";
import { createDisputeSchema } from "./disputes.dto";
import { DisputesService } from "./disputes.service";

@Controller("v1/disputes")
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post()
  @UseGuards(HmacGuard)
  async create(@Body() body: unknown) {
    const input = createDisputeSchema.parse(body);
    return this.disputesService.createDispute(input);
  }

  @Get()
  async list(
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    const parsedStatus = status ? (status as DisputeStatus) : undefined;
    if (parsedStatus && !Object.values(DisputeStatus).includes(parsedStatus)) {
      throw new NotFoundException("Unknown status");
    }

    const parsedPage = page ? Number(page) : 1;
    const parsedPageSize = pageSize ? Number(pageSize) : 20;
    return this.disputesService.listDisputes(parsedStatus, parsedPage, parsedPageSize);
  }

  @Get(":platformDisputeId")
  async get(@Param("platformDisputeId") platformDisputeId: string) {
    const dispute = await this.disputesService.getDispute(platformDisputeId);
    if (!dispute) {
      throw new NotFoundException("Dispute not found");
    }
    return dispute;
  }

  @Post(":platformDisputeId/force-finalize")
  @UseGuards(HmacGuard)
  async forceFinalize(@Param("platformDisputeId") platformDisputeId: string) {
    const result = await this.disputesService.forceFinalize(platformDisputeId);
    if (!result) {
      throw new NotFoundException("Dispute not found");
    }
    return result;
  }
}
