import { PartialType } from '@nestjs/swagger';
import { CreateFeeDto } from './create-fee.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateFeeDto extends PartialType(CreateFeeDto) {
  // schoolId is not updatable after creation — exclude it from the partial
  @IsOptional()
  @IsString()
  declare schoolId?: string;
}
