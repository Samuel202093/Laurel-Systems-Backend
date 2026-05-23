import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ResultStatus } from '@prisma/client';

export class ApproveExamDto {
  @IsEnum(ResultStatus)
  status: ResultStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
