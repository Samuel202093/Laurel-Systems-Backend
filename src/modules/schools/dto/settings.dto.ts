import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCalendarDto {
  @IsString()
  sessionId: string;

  @IsString()
  termId: string;

  @IsString()
  @IsOptional()
  resumptionDate?: string;

  @IsString()
  @IsOptional()
  closingDate?: string;
}

export class GradeDto {
  @IsString()
  grade: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  min: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  max: number;

  @IsString()
  remark: string;
}

export class UpdateGradingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GradeDto)
  grades: GradeDto[];

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  passMark?: number;
}

export class UpdateLocationDto {
  @IsString()
  latitude: string;

  @IsString()
  longitude: string;

  @Type(() => Number)
  @IsNumber()
  radius: number;
}

export class UpdatePreferencesDto {
  @Type(() => Boolean)
  @IsBoolean()
  emailAlerts: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  smsAlerts: boolean;

  @IsString()
  currency: string;

  @IsEnum(['auto', 'manual'])
  publicationMode: string;
}

export class UpdateBrandingDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  shortName?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  address?: string;
}
