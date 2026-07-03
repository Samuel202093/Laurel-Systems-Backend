import { IsNotEmpty, IsString, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClassDto {
  @ApiProperty({ example: 'JSS 1', description: 'The name of the class' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'uuid-of-school',
    description: 'The unique ID of the school',
  })
  @IsString()
  @IsNotEmpty()
  schoolId: string;

  @ApiProperty({
    example: ['A', 'B', 'Gold'],
    description: 'Initial arms for the class',
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  arms?: string[];
}
