import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

export class EvaluationDto {
  @IsUUID()
  diagnosticSessionId!: string;
}

export class WorkDto {
  @IsString()
  @Length(3, 4000)
  workSummary!: string;

  @IsOptional()
  @IsString()
  @Length(3, 2000)
  internalNote?: string;
}

export class ReadyDto {
  @IsOptional()
  @IsString()
  @Length(3, 2000)
  note?: string;
}

export class DeliverDto {
  @IsOptional()
  @IsString()
  @Length(3, 2000)
  deliveryNote?: string;
}

export class ReasonDto {
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class ApprovalRequestDto {
  @IsString()
  @Length(3, 2000)
  description!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedAmount?: number;
}

export class PublicApprovalResponseDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @Length(3, 1000)
  reason?: string;
}
