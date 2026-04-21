import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ResultStatus } from '../../../common/constants/result-status.enum';

export class ApproveResultDto {
  @ApiProperty({ enum: ResultStatus })
  @IsEnum(ResultStatus)
  status: ResultStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
