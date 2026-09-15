import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class DiagnosticFeedbackDto {
  @IsBoolean()
  useful!: boolean;

  @IsOptional()
  @IsUUID()
  localSolutionId?: string;
}
