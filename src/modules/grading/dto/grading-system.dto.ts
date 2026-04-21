import { IsString, IsInt, IsOptional, IsArray, ValidateNested, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GradeLevelDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  abbreviation?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiProperty()
  @IsInt()
  minScore: number;

  @ApiProperty()
  @IsInt()
  maxScore: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  point?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class AssessmentTypeDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  abbreviation: string;

  @ApiProperty()
  @IsInt()
  maxScore: number;

  @ApiProperty()
  @IsInt()
  weight: number;
}

export class PromotionCriteriaDto {
  @ApiProperty()
  @IsInt()
  minAverageScore: number;

  @ApiProperty()
  @IsInt()
  minSubjectsPassed: number;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  mandatorySubjects: string[];

  @ApiProperty()
  @IsBoolean()
  useCumulativeAverage: boolean;
}

export class CreateGradingSystemDto {
  @ApiProperty()
  @IsString()
  sessionId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  termId?: string;

  @ApiProperty({ type: [GradeLevelDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GradeLevelDto)
  grades: GradeLevelDto[];

  @ApiProperty({ type: [AssessmentTypeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssessmentTypeDto)
  assessments: AssessmentTypeDto[];

  @ApiProperty()
  @IsInt()
  passMark: number;

  @ApiProperty({ type: PromotionCriteriaDto })
  @ValidateNested()
  @Type(() => PromotionCriteriaDto)
  promotionCriteria: PromotionCriteriaDto;
}
