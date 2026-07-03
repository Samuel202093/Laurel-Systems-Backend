import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreatePlatformConfigDto {
  @ApiPropertyOptional({
    description: 'Specific school ID or null for global default',
  })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiProperty({
    example: 50000,
    description: 'Flat fee in kobo (e.g. 50000 = ₦500)',
  })
  @IsInt()
  @Min(0)
  flatKobo: number;

  @ApiProperty({
    example: 150,
    description: 'Percentage in basis points (e.g. 150 = 1.5%)',
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  percentageBps: number;

  @ApiPropertyOptional({
    example: 200000,
    description: 'Maximum charge in kobo (0 = no cap)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  capKobo?: number;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Minimum charge in kobo (0 = no minimum)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumKobo?: number;

  @ApiProperty({ description: 'Description of this charge rule' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePlatformConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  flatKobo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  percentageBps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  capKobo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumKobo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
