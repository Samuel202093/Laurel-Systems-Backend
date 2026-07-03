import {
  IsString,
  IsArray,
  IsEnum,
  IsOptional,
  ArrayMinSize,
  IsEmail,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Enums ──────────────────────────────────────────────────────────────────
export enum RecipientType {
  STAFF = 'staff',
  PARENTS = 'parents',
  BOTH = 'both',
  CUSTOM = 'custom',
}

export enum CommunicationStatus {
  SENT = 'sent',
  PARTIAL = 'partial',
  FAILED = 'failed',
}

// ─── Bulk Email DTO ──────────────────────────────────────────────────────────
export class SendEmailDto {
  @ApiProperty({
    description: 'Array of valid recipient email addresses',
    example: ['staff1@school.com', 'parent1@school.com'],
    type: [String],
  })
  @IsArray()
  @IsEmail(
    {},
    { each: true, message: 'Each recipient must be a valid email address' },
  )
  @ArrayMinSize(1, { message: 'At least one recipient email is required' })
  recipients: string[];

  @ApiProperty({
    description: 'Email subject line',
    example: 'School Announcement: Sports Day',
  })
  @IsString()
  @IsNotEmpty({ message: 'Subject is required' })
  subject: string;

  @ApiProperty({
    description: 'The body of the email message',
    example:
      'Please be informed that the annual sports day will hold on Friday...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Message body is required' })
  message: string;

  @ApiProperty({
    description: 'Category of recipients for history tracking',
    enum: RecipientType,
    example: RecipientType.STAFF,
  })
  @IsEnum(RecipientType, {
    message: `recipientType must be one of: ${Object.values(RecipientType).join(', ')}`,
  })
  recipientType: RecipientType;

  @ApiPropertyOptional({
    description: 'Attachment URL from Cloudinary (if pre-uploaded)',
  })
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional({
    description: 'Cloudinary public ID for the attachment (for deletion)',
  })
  @IsOptional()
  @IsString()
  filePublicId?: string;
}

// ─── Single Email DTO ────────────────────────────────────────────────────────
export class SendSingleEmailDto {
  @ApiProperty({
    description: 'The single recipient email address',
    example: 'john.doe@school.com',
  })
  @IsEmail({}, { message: 'recipient must be a valid email address' })
  @IsNotEmpty()
  recipient: string;

  @ApiPropertyOptional({
    description:
      'Full name of the recipient for personalised greeting (optional)',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  recipientName?: string;

  @ApiProperty({
    description: 'Email subject line',
    example: 'Important Notice from the School',
  })
  @IsString()
  @IsNotEmpty({ message: 'Subject is required' })
  subject: string;

  @ApiProperty({
    description: 'The body of the email message',
    example: 'Dear John, we would like to inform you that...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Message body is required' })
  message: string;

  @ApiProperty({
    description: 'Category of the communication for history tracking',
    enum: RecipientType,
    example: RecipientType.CUSTOM,
  })
  @IsEnum(RecipientType, {
    message: `recipientType must be one of: ${Object.values(RecipientType).join(', ')}`,
  })
  recipientType: RecipientType;

  @ApiPropertyOptional({
    description: 'Attachment URL from Cloudinary (if pre-uploaded)',
  })
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional({
    description: 'Cloudinary public ID for the attachment (for deletion)',
  })
  @IsOptional()
  @IsString()
  filePublicId?: string;
}

// ─── Save History DTO ────────────────────────────────────────────────────────
export class SaveHistoryDto {
  @ApiProperty({ description: 'Email subject' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ description: 'Email message body' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ enum: RecipientType })
  @IsEnum(RecipientType)
  recipientType: RecipientType;

  @ApiProperty({
    description: 'Array of recipient email addresses',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  recipients: string[];

  @ApiProperty({
    description: 'Delivery status of the communication',
    enum: CommunicationStatus,
    example: CommunicationStatus.SENT,
  })
  @IsEnum(CommunicationStatus, {
    message: `status must be one of: ${Object.values(CommunicationStatus).join(', ')}`,
  })
  status: CommunicationStatus;

  @ApiPropertyOptional({
    description: 'Error detail if delivery failed or was partial',
  })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional({ description: 'Attachment URL from Cloudinary' })
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional({
    description: 'Cloudinary public ID for the attachment',
  })
  @IsOptional()
  @IsString()
  filePublicId?: string;
}
