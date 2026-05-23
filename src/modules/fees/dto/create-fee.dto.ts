import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsArray,
  ArrayMinSize,
  IsOptional,
  IsIn,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFeeDto {
  @ApiProperty({ example: 'uuid-of-school' })
  @IsString()
  @IsNotEmpty()
  schoolId: string;

  @ApiProperty({ example: 'Senior Secondary Tuition' })
  @IsString()
  @IsNotEmpty()
  feeName: string;

  @ApiProperty({ example: ['Tuition'], enum: ['Tuition', 'Exam', 'PTA', 'Lab', 'Sports', 'Uniform', 'Books', 'Other'], isArray: true })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  feeCategory: string[];

  @ApiProperty({ example: '2025/2026' })
  @IsString()
  @IsNotEmpty()
  session: string;

  @ApiProperty({ example: 'First Term', enum: ['First Term', 'Second Term', 'Third Term'] })
  @IsString()
  @IsIn(['First Term', 'Second Term', 'Third Term'])
  term: string;

  @ApiProperty({ example: 50000, description: 'Fee amount (must be > 0)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'NGN' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ example: ['JSS 1', 'JSS 2'], description: 'Class labels this fee targets', isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  applicableClasses: string[];

  @ApiProperty({ example: '2025-11-30', description: 'ISO date string for payment deadline' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({ example: 'full', enum: ['full', 'installments'], default: 'full' })
  @IsString()
  @IsIn(['full', 'installments'])
  paymentPlan: string;

  @ApiPropertyOptional({ example: 3, description: 'Max installment count (2–5). Required when paymentPlan=installments' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(10)
  installments?: number;

  @ApiPropertyOptional({ example: 'Exempt scholarship students' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: ['acc-id-1', 'acc-id-2'], description: 'Array of bank account IDs', isArray: true })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  bankAccountIds?: string[];
}
