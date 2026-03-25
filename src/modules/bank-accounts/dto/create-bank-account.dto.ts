import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum, Length, IsBoolean } from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({ example: 'uuid-of-school', description: 'The unique ID of the school' })
  @IsString()
  @IsNotEmpty()
  schoolId: string;

  @ApiProperty({ example: 'John Doe', description: 'The name on the bank account' })
  @IsString()
  @IsNotEmpty()
  accountName: string;

  @ApiProperty({ example: '0123456789', description: 'The 10-digit account number' })
  @IsString()
  @IsNotEmpty()
  @Length(10, 10)
  accountNumber: string;

  @ApiProperty({ example: 'Access Bank', description: 'The name of the bank' })
  @IsString()
  @IsNotEmpty()
  bankName: string;

  @ApiProperty({ example: '044', description: 'The bank code', required: false })
  @IsString()
  @IsOptional()
  bankCode?: string;

  @ApiProperty({ example: 'NGN', description: 'The currency of the account', default: 'NGN' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ example: true, description: 'Whether this is the primary bank account', default: true })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}
