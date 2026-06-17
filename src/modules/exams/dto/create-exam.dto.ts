import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuestionOptionDto {
  @IsString()
  label: string;

  @IsString()
  text: string;
}

export class CreateQuestionDto {
  @IsString()
  questionText: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options: QuestionOptionDto[];

  @IsString()
  correctAnswer: string;

  @IsNumber()
  @Type(() => Number)
  marks: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imagePublicId?: string;

  @IsOptional()
  @IsBoolean()
  hasImage?: boolean;
}

export class CreateExamDto {
  @IsString()
  schoolId: string;

  @IsString()
  teacherId: string;

  @IsString()
  subjectId: string;

  @IsString()
  classId: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  term: string;

  @IsString()
  title: string;

  @IsNumber()
  @Type(() => Number)
  durationMinutes: number;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  markPerQuestion?: number;

  @IsNumber()
  @Type(() => Number)
  totalMarks: number;

  @IsNumber()
  @Type(() => Number)
  totalQuestions: number;

  @IsOptional()
  @IsString()
  examKey?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}
