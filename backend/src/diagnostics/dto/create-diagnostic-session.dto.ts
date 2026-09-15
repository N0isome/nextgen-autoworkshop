import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateDiagnosticSessionDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional() @IsUUID()
  workOrderId?: string;

  @IsIn(['OBD2', 'BOSCH', 'LAUNCH', 'ELM327', 'MANUAL'])
  source!: 'OBD2' | 'BOSCH' | 'LAUNCH' | 'ELM327' | 'MANUAL';

  @IsOptional()
  @IsString()
  @Length(3, 120)
  scannerModel?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Matches(/^[BCPU][0-9A-F]{4}$/i, { each: true })
  dtcCodes!: string[];

  @IsOptional()
  @IsString()
  @Length(1, 4000)
  rawPayload?: string;
}
