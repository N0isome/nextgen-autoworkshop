import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @Length(3, 160)
  displayName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+ ()-]{7,30}$/)
  phone?: string;
}
