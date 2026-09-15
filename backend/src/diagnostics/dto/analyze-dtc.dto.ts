import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator';

class VehicleDto {
  @IsString() @Length(2, 80) brand!: string;
  @IsString() @Length(1, 100) model!: string;
  @IsInt() @Min(1950) @Max(2100) year!: number;
  @IsOptional() @IsString() @Length(1, 100) engine?: string;
}

class DiagnosticDto {
  @IsString() @Matches(/^[BCPU][0-9A-F]{4}$/i) dtc_code!: string;
  @IsOptional() @IsString() @Length(1, 2000) mechanic_notes?: string;
}

export class AnalyzeDtcDto {
  @IsString() @Length(1, 100) user_id!: string;
  @ValidateNested() @Type(() => VehicleDto) vehicle!: VehicleDto;
  @ValidateNested() @Type(() => DiagnosticDto) diagnostics!: DiagnosticDto;
}
