import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { DevelopmentAuthGuard } from '../common/request-context';
import { CreateDiagnosticSessionDto } from './dto/create-diagnostic-session.dto';
import { AnalyzeDtcDto } from './dto/analyze-dtc.dto';
import { DiagnosticFeedbackDto } from './dto/diagnostic-feedback.dto';
import { KnowledgeRequestDto } from './dto/knowledge-request.dto';
import { DiagnosticsKnowledgeService } from './diagnostics-knowledge.service';
import { DiagnosticsService } from './diagnostics.service';

@Controller('diagnostics')
@UseGuards(DevelopmentAuthGuard)
export class DiagnosticsController {
  constructor(
    private readonly diagnostics: DiagnosticsService,
    private readonly knowledge: DiagnosticsKnowledgeService,
  ) {}

  @Post('sessions')
  create(@Req() request: Request, @Body() dto: CreateDiagnosticSessionDto) {
    return this.diagnostics.createSession(request.context!, dto);
  }

  @Post('analyze')
  analyze(@Req() request: Request, @Body() dto: AnalyzeDtcDto) {
    return this.diagnostics.analyze(request.context!, dto);
  }

  @Get('sessions/:sessionId')
  getSession(@Req() request: Request, @Param('sessionId') sessionId: string) {
    return this.diagnostics.getSession(request.context!, sessionId);
  }

  @Post('knowledge')
  executeKnowledgeFlow(@Req() request: Request, @Body() dto: KnowledgeRequestDto) {
    return this.knowledge.execute(request.context!, dto);
  }

  @Post('sessions/:sessionId/codes/:code/feedback')
  saveFeedback(
    @Req() request: Request,
    @Param('sessionId') sessionId: string,
    @Param('code') code: string,
    @Body() dto: DiagnosticFeedbackDto,
  ) {
    return this.knowledge.feedback(request.context!, sessionId, code, dto);
  }

  @Get('vehicles/:vehicleId/history')
  history(@Req() request: Request, @Param('vehicleId') vehicleId: string) {
    return this.diagnostics.history(request.context!, vehicleId);
  }
}
