import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StudentLoginDto {
  @ApiProperty({
    example: 'STU/2024/001',
    description: 'The registration number of the student',
  })
  @IsString()
  @IsNotEmpty()
  registrationNumber: string;

  @ApiProperty({
    example: 'password123',
    description: 'The password of the student',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
