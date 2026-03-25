import { IsString, IsEmail, IsNotEmpty, IsOptional, IsEnum, MinLength, IsBoolean, IsUrl } from 'class-validator';

export enum UserRole {
  SCHOOL_OWNER = 'school owner',
  DIRECTOR = 'director',
  PRINCIPAL = 'principal',
  TEACHER = 'teacher',
  ICT_ADMIN = 'ICT admin',
  OTHERS = 'others',
}

export class CreateSchoolDto {
  // School info
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  shortName?: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsUrl()
  @IsOptional()
  website?: string;

  // Admin user info
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  gender: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @IsOptional()
  roleOther?: string;

  @IsBoolean()
  agreeToTerms: boolean;

  @IsString()
  @IsNotEmpty()
  otpCode: string;
}
