import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CommunicationService } from './communication.service';
import {
  SendEmailDto,
  SendSingleEmailDto,
  SaveHistoryDto,
  RecipientType,
} from './dto/communication.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/** Roles permitted to send school communications */
const COMMUNICATION_ROLES = [
  'SCHOOL_ADMIN',
  'SCHOOL_OWNER',
  'DIRECTOR',
  'PRINCIPAL',
  'ICT_ADMIN',
  'SUB_ADMIN',
] as const;

@ApiTags('Communication')
@ApiBearerAuth()
@Controller('communication')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunicationController {
  constructor(private readonly communicationService: CommunicationService) {}

  // ─── Bulk Email ───────────────────────────────────────────────────────────
  @Post('send/:schoolId')
  @HttpCode(HttpStatus.OK)
  @Roles(...COMMUNICATION_ROLES)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'schoolId', description: 'Unique ID of the school' })
  @ApiOperation({
    summary: 'Send a bulk email to multiple recipients (BCC batching)',
    description:
      'Sends a branded school email to all supplied recipient addresses using BCC batching ' +
      '(50 per batch, 3 concurrent, 300 ms inter-window delay). ' +
      'Recipients are deduplicated before sending. An optional file attachment can be uploaded simultaneously. ' +
      'Uses Promise.allSettled so partial failures are reported without aborting the full dispatch.',
  })
  @ApiBody({
    description: 'Bulk email payload (multipart/form-data)',
    schema: {
      type: 'object',
      required: ['recipients', 'subject', 'message', 'recipientType'],
      properties: {
        recipients: {
          type: 'array',
          items: { type: 'string', format: 'email' },
          description: 'Array of valid recipient email addresses',
          example: ['staff1@school.com', 'parent1@school.com'],
        },
        subject: { type: 'string', example: 'Sports Day Announcement' },
        message: {
          type: 'string',
          example: 'Dear all, please note that Sports Day...',
        },
        recipientType: {
          type: 'string',
          enum: Object.values(RecipientType),
          example: RecipientType.STAFF,
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Optional file attachment (PDF, image, etc.)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Bulk email dispatch completed (check status field for partial failures)',
    schema: {
      example: {
        success: true,
        schoolName: 'Laurel Academy',
        message: 'Laurel Academy — Email sent successfully to 42 recipient(s).',
        data: {
          sentCount: 42,
          failedCount: 0,
          totalRecipients: 42,
          status: 'sent',
          history: { id: 'uuid', timestamp: '2025-01-01T00:00:00.000Z' },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — JWT token missing or invalid',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async sendBulkEmail(
    @Param('schoolId') schoolId: string,
    @Body() payload: SendEmailDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    // Multipart form-data can send arrays as a single comma-joined string or JSON — normalise here
    let recipientsRaw: any = payload.recipients;
    if (typeof recipientsRaw === 'string') {
      try {
        recipientsRaw = JSON.parse(recipientsRaw);
      } catch {
        recipientsRaw = (recipientsRaw as string)
          .split(',')
          .map((r: string) => r.trim());
      }
    }
    payload.recipients = Array.isArray(recipientsRaw)
      ? recipientsRaw.map((r: string) => r.trim()).filter(Boolean)
      : [String(recipientsRaw).trim()];

    return this.communicationService.sendBulkEmail(schoolId, payload, file);
  }

  // ─── Single Email ─────────────────────────────────────────────────────────
  @Post('send-single/:schoolId')
  @HttpCode(HttpStatus.OK)
  @Roles(...COMMUNICATION_ROLES)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'schoolId', description: 'Unique ID of the school' })
  @ApiOperation({
    summary: 'Send a single branded email to one specific recipient',
    description:
      'Sends a personalised, school-branded email to exactly one recipient. ' +
      'Supply `recipientName` to include a "Dear [Name]" greeting. ' +
      'An optional file attachment can be uploaded simultaneously. ' +
      'School resolution and file upload happen in parallel for efficiency.',
  })
  @ApiBody({
    description: 'Single email payload (multipart/form-data)',
    schema: {
      type: 'object',
      required: ['recipient', 'subject', 'message', 'recipientType'],
      properties: {
        recipient: {
          type: 'string',
          format: 'email',
          example: 'john.doe@school.com',
        },
        recipientName: {
          type: 'string',
          description: 'Full name used in the greeting (optional)',
          example: 'John Doe',
        },
        subject: { type: 'string', example: 'Important Notice' },
        message: {
          type: 'string',
          example: 'We would like to inform you that...',
        },
        recipientType: {
          type: 'string',
          enum: Object.values(RecipientType),
          example: RecipientType.CUSTOM,
        },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Single email dispatch result',
    schema: {
      example: {
        success: true,
        schoolName: 'Laurel Academy',
        message:
          'Laurel Academy — Email sent successfully to john.doe@school.com.',
        data: {
          status: 'sent',
          history: { id: 'uuid', timestamp: '2025-01-01T00:00:00.000Z' },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — JWT token missing or invalid',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async sendSingleEmail(
    @Param('schoolId') schoolId: string,
    @Body() payload: SendSingleEmailDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.communicationService.sendSingleEmail(schoolId, payload, file);
  }

  // ─── Get History (paginated) ──────────────────────────────────────────────
  @Get('history/:schoolId')
  @Roles(...COMMUNICATION_ROLES)
  @ApiParam({ name: 'schoolId', description: 'Unique ID of the school' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Records per page (default: 20, max: 100)',
  })
  @ApiOperation({
    summary: 'Get paginated communication history for a school',
    description:
      'Returns sent email records ordered by most recent first, with pagination metadata.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated communication history',
    schema: {
      example: {
        data: [
          {
            id: 'uuid',
            subject: 'Sports Day',
            status: 'sent',
            timestamp: '2025-01-01T00:00:00.000Z',
          },
        ],
        meta: { total: 45, page: 1, limit: 20, totalPages: 3 },
      },
    },
  })
  async getHistory(
    @Param('schoolId') schoolId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.communicationService.getHistory(schoolId, page, limit);
  }

  // ─── Save History (manual) ────────────────────────────────────────────────
  @Post('history/:schoolId')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...COMMUNICATION_ROLES)
  @ApiParam({ name: 'schoolId', description: 'Unique ID of the school' })
  @ApiOperation({ summary: 'Manually save a communication record to history' })
  @ApiResponse({ status: 201, description: 'History record created' })
  async saveHistory(
    @Param('schoolId') schoolId: string,
    @Body() payload: SaveHistoryDto,
  ) {
    const record = await this.communicationService.saveHistory(
      schoolId,
      payload,
    );
    return {
      success: true,
      message: 'Communication history record saved.',
      data: record,
    };
  }

  // ─── Delete Record ────────────────────────────────────────────────────────
  @Delete(':id/:schoolId')
  @Roles(...COMMUNICATION_ROLES)
  @ApiParam({ name: 'id', description: 'Communication record ID to delete' })
  @ApiParam({
    name: 'schoolId',
    description: 'Unique ID of the school (ownership check)',
  })
  @ApiOperation({
    summary: 'Delete a communication record and its Cloudinary attachment',
    description:
      'Removes the DB record and attempts to delete any associated Cloudinary file. ' +
      'Cloudinary deletion failures are non-fatal — the DB record is always removed.',
  })
  @ApiResponse({ status: 200, description: 'Record deleted' })
  @ApiResponse({
    status: 404,
    description: 'Record not found or does not belong to this school',
  })
  async deleteMail(
    @Param('id') id: string,
    @Param('schoolId') schoolId: string,
  ) {
    return this.communicationService.deleteMail(id, schoolId);
  }
}
