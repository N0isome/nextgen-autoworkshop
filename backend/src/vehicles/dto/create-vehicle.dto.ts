import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export class CreateVehicleDto {
  @IsUUID() customerId!: string;
  @IsOptional() @IsString() @Matches(/^[A-HJ-NPR-Z0-9]{17}$/i) vin?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z0-9-]{4,15}$/i) plate?: string;
  @IsString() @Length(2, 80) make!: string;
  @IsString() @Length(1, 100) model!: string;
  @IsOptional() @IsInt() @Min(1950) @Max(2100) modelYear?: number;
  @IsOptional() @IsString() @Length(1, 100) engine?: string;
}
