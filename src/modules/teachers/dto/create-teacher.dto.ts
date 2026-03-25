import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class NextOfKinDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
 @IsOptional()
  surname?: string;

  @ApiProperty({ example: 'Smith', required: false })
  @IsString()
  @IsOptional()
  otherName?: string;

  @ApiProperty({ example: 'Spouse' })
  @IsString()
  @IsOptional()
  relationship?: string;

  @ApiProperty({ example: '+2348012345679' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty({ example: 'jane.doe@example.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: '456 Allen Avenue, Lagos' })
  @IsString()
  @IsOptional()
  address?: string;
}

export class CreateTeacherDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'SCHL-JOH-12345' })
  @IsString()
  @IsNotEmpty()
  staffId: string;

  @ApiProperty({ enum: ['single', 'married', 'divorced', 'widowed'] })
  @IsEnum(['single', 'married', 'divorced', 'widowed'])
  @IsNotEmpty()
  maritalStatus: string;

  @ApiProperty({ enum: ['academic', 'non-academic'] })
  @IsEnum(['academic', 'non-academic'])
  @IsNotEmpty()
  staffType: string;

  @ApiProperty({ example: '1985-05-20', required: false })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiProperty({ enum: ['male', 'female', 'other'], required: false })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiProperty({ example: 'Nigeria' })
  @IsString()
  @IsNotEmpty()
  nationality: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @IsNotEmpty()
  stateOfOrigin: string;

  @ApiProperty({ example: 'Ikeja' })
  @IsString()
  @IsNotEmpty()
  lgaOfOrigin: string;

  @ApiProperty({ example: 'Nigeria' })
  @IsString()
  @IsNotEmpty()
  countryOfResidence: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @IsNotEmpty()
  stateOfResidence: string;

  @ApiProperty({ example: '123 Allen Avenue, Lagos' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ type: [String], example: ['Mathematics', 'Further Mathematics'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  subjects?: string[];

  @ApiProperty({ example: 'Mathematics', required: false })
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiProperty({ example: 'Administration', required: false })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty({ type: [String], example: ['JSS 1', 'JSS 2'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  classesAssigned?: string[];

  @ApiProperty({ type: [String], example: ['A', 'B'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  armsAssigned?: string[];

  @ApiProperty({ type: [String], example: ['JSS 1'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  formTeacherClasses?: string[];

  @ApiProperty({ type: [String], example: ['A'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  formTeacherArms?: string[];

  @ApiProperty({ enum: ['none', 'classes'], required: false })
  @IsEnum(['none', 'classes'])
  @IsOptional()
  formTeacherAssignment?: string;

  @ApiProperty({ type: NextOfKinDto, required: false })
  @ValidateNested()
  @Type(() => NextOfKinDto)
  @IsOptional()
  nextOfKin?: NextOfKinDto;
}
