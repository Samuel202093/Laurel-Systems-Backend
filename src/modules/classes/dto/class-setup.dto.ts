import { IsBoolean, IsArray, IsString, IsOptional, ValidateNested, IsNotEmpty, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class ClassLevelSelectionDto {
  @IsString()
  @IsNotEmpty()
  structure: string;

  @IsArray()
  @IsNumber({}, { each: true })
  levels: number[];
}

class ClassLevelDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassLevelSelectionDto)
  selections: ClassLevelSelectionDto[];
}

class ClassArmDto {
  @IsBoolean()
  hasArms: boolean;

  @IsString()
  @IsOptional()
  style?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  arms?: string[];
}

export class ClassSetupDto {
  @ValidateNested()
  @Type(() => ClassLevelDto)
  classLevel: ClassLevelDto;

  @ValidateNested()
  @Type(() => ClassArmDto)
  classArm: ClassArmDto;
}
