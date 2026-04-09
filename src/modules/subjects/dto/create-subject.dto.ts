import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({ example: 'Mathematics' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'MATH101', required: false })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiProperty({ example: 'Fundamental mathematics principles', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    enum: ['General', 'Science', 'Arts', 'Commercial', 'Vocational', 'Languages'],
    default: 'General',
  })
  @IsEnum(['General', 'Science', 'Arts', 'Commercial', 'Vocational', 'Languages'])
  @IsOptional()
  category?: string;
}
