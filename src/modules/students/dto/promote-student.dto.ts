import { IsNotEmpty, IsUUID, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PromoteStudentDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  targetClassId: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  targetClassArmId: string;
}

export class PromoteMultipleStudentsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  studentIds: string[];

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  targetClassId: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  targetClassArmId: string;
}
