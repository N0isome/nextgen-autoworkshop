import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class KnowledgeVehicleDto {
  @IsString() @Length(2, 80) brand!: string;
  @IsString() @Length(1, 100) model!: string;
  @IsInt() @Min(1950) @Max(2100) year!: number;
  @IsOptional() @IsString() @Length(1, 100) engine?: string;
}

class RealSolutionDataDto {
  @IsString() @Length(2, 200) failed_component!: string;
  @IsString() @Length(3, 4000) mechanic_notes!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  attached_files?: string[];
}

class KnowledgePayloadDto {
  @IsOptional() @IsString() @Matches(/^[BCPU][0-9A-F]{4}$/i) dtc_code?: string;
  @IsOptional() @IsUUID() diagnostic_session_id?: string;
  @IsOptional() @ValidateNested() @Type(() => RealSolutionDataDto) real_solution_data?: RealSolutionDataDto;
}

export class KnowledgeRequestDto {
  @IsString() @Length(1, 100) mechanic_id!: string;
  @ValidateNested() @Type(() => KnowledgeVehicleDto) vehicle!: KnowledgeVehicleDto;
  @IsIn(['diagnostico_inicial', 'alimentacion_manual']) request_type!: 'diagnostico_inicial' | 'alimentacion_manual';
  @ValidateNested() @Type(() => KnowledgePayloadDto) payload!: KnowledgePayloadDto;
}
