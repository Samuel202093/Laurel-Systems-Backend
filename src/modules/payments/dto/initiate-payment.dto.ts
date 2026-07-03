import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentProcessor {
  PAYSTACK = 'paystack',
  KORAPAY = 'korapay',
  FLUTTERWAVE = 'flutterwave',
}

export enum PaymentChannel {
  CARD = 'card',
  BANK_TRANSFER = 'bank_transfer', // Virtual account / NIP transfer — cheapest option
  USSD = 'ussd',
}

export class PaymentFeeItemDto {
  @ApiProperty({ example: 'a5ef3810-fa24-472c-814d-2d266fd616ff' })
  @IsUUID()
  feeId: string;

  @ApiProperty({ example: 'full', enum: ['full', 'installments'] })
  @IsEnum(['full', 'installments'])
  paymentPlan: 'full' | 'installments';

  // NOTE: `amount` and `installmentNumber` are intentionally removed from the DTO.
  // The server calculates the correct amount and determines the next installment
  // number based on payment history. Never trust the client for these values.
}

export class InitiatePaymentDto {
  @ApiProperty({ type: [PaymentFeeItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentFeeItemDto)
  fees: PaymentFeeItemDto[];

  @ApiProperty({ enum: PaymentProcessor, example: PaymentProcessor.PAYSTACK })
  @IsEnum(PaymentProcessor)
  processor: PaymentProcessor;

  @ApiPropertyOptional({
    enum: PaymentChannel,
    example: PaymentChannel.BANK_TRANSFER,
    description:
      'Payment channel. Use bank_transfer to avoid card processing fees (recommended for large school fees)',
  })
  @IsOptional()
  @IsEnum(PaymentChannel)
  channel?: PaymentChannel;

  @ApiProperty({ example: 'student-id-uuid' })
  @IsUUID()
  studentId: string;
}

export class VerifyPaymentDto {
  @ApiProperty({ example: 'TRX-ABC123DEF456' })
  @IsString()
  @IsNotEmpty()
  reference: string;

  @ApiProperty({ enum: PaymentProcessor })
  @IsEnum(PaymentProcessor)
  processor: PaymentProcessor;
}
