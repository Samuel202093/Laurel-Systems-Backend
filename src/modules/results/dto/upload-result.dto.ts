import {
  IsString,
  IsNumber,
  IsNotEmpty,
  IsObject,
  IsArray,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class StudentScoreItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    description: 'Object containing scores for each assessment type',
  })
  @IsObject()
  assessmentScores: Record<string, number>;

  @ApiProperty()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UploadResultDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classArmId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  termName: string;

  @ApiProperty({ type: [StudentScoreItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentScoreItemDto)
  scores: StudentScoreItemDto[];
}
