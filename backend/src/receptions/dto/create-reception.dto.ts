import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
export class CreateReceptionDto {
  @IsUUID() customerId!: string;
  @IsUUID() vehicleId!: string;
  @IsString() @Length(3, 4000) concern!: string;
  @IsInt() @Min(0) odometerKm!: number;
  @IsInt() @Min(0) @Max(100) fuelLevelPercent!: number;
  @IsOptional() @IsString() @Length(1, 4000) exteriorCondition?: string;
  @IsOptional() @IsString() @Length(1, 80) bayLabel?: string;
  @IsOptional() @IsString() @Length(1, 4000) notes?: string;
}
