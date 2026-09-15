import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateWorkOrderDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  vehicleId!: string;

  @IsString()
  @Length(3, 4000)
  concern!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9 -]{4,15}$/i)
  plate?: string;
}
