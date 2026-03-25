import { IsEmail, IsNotEmpty, IsOptional, IsString, IsEnum, IsDateString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStudentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  registrationNumber: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  level?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  arm?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({ enum: ['male', 'female'] })
  @IsEnum(['male', 'female'])
  @IsOptional()
  gender?: string;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  parentsFullName?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  parentsPhoneNumber?: string;

  @ApiProperty()
  @IsEmail()
  @IsOptional()
  parentsEmail?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  nationality?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  stateOfOrigin?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  lgaOfOrigin?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty()
  @IsOptional()
  classId?: string;

  @ApiProperty()
  @IsOptional()
  classArmId?: string;
}
