import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { DevelopmentAuthGuard } from '../common/request-context';
import { ApprovalRequestDto, DeliverDto, EvaluationDto, ReadyDto, ReasonDto, WorkDto } from './dto/service-command.dto';
import { ServicesService } from './services.service';

@Controller('services')
@UseGuards(DevelopmentAuthGuard)
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get('inbox')
  inbox(@Req() request: Request, @Query('bucket') bucket?: string) { return this.services.inbox(request.context!, bucket); }

  @Get(':id')
  findOne(@Req() request: Request, @Param('id') id: string) { return this.services.findOne(request.context!, id); }

  @Post(':id/evaluation')
  evaluation(@Req() request: Request, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string, @Body() dto: EvaluationDto) {
    return this.services.saveEvaluation(request.context!, id, key, dto);
  }

  @Post(':id/work')
  work(@Req() request: Request, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string, @Body() dto: WorkDto) {
    return this.services.registerWork(request.context!, id, key, dto);
  }

  @Post(':id/ready')
  ready(@Req() request: Request, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string, @Body() dto: ReadyDto) {
    return this.services.markReady(request.context!, id, key, dto);
  }

  @Post(':id/deliver')
  deliver(@Req() request: Request, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string, @Body() dto: DeliverDto) {
    return this.services.deliver(request.context!, id, key, dto);
  }

  @Post(':id/pause')
  pause(@Req() request: Request, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.services.pause(request.context!, id, key, dto);
  }

  @Post(':id/resume')
  resume(@Req() request: Request, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string) {
    return this.services.resume(request.context!, id, key);
  }

  @Post(':id/cancel')
  cancel(@Req() request: Request, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.services.cancel(request.context!, id, key, dto);
  }

  @Post(':id/reopen')
  reopen(@Req() request: Request, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.services.reopen(request.context!, id, key, dto);
  }

  @Post(':id/approval-requests')
  requestApproval(@Req() request: Request, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string, @Body() dto: ApprovalRequestDto) {
    return this.services.requestApproval(request.context!, id, key, dto);
  }

  @Post(':id/approval-requests/:approvalId/withdraw')
  withdrawApproval(@Req() request: Request, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string, @Param('approvalId') approvalId: string, @Body() dto: ReasonDto) {
    return this.services.withdrawApproval(request.context!, id, approvalId, key, dto);
  }
}
