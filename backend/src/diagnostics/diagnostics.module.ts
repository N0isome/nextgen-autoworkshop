import { Module } from '@nestjs/common';
import { DevelopmentAuthGuard } from '../common/request-context';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsKnowledgeService } from './diagnostics-knowledge.service';
import { DiagnosticsService } from './diagnostics.service';
import { OfficialTechnicalSourcesService } from './official-technical-sources.service';

@Module({
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService, DiagnosticsKnowledgeService, OfficialTechnicalSourcesService, DevelopmentAuthGuard],
})
export class DiagnosticsModule {}
