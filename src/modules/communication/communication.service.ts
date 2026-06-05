import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import {
  SendEmailDto,
  SendSingleEmailDto,
  SaveHistoryDto,
  CommunicationStatus,
} from './dto/communication.dto';

// ─── Shared type for school identity ────────────────────────────────────────
interface SchoolInfo {
  id: string;
  name: string;
  shortName: string | null;
  address: string;
  state: string;
  country: string;
  website: string | null;
}

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);

  /** Max recipients per BCC batch — keeps individual SMTP payloads manageable */
  private readonly BATCH_SIZE = 50;
  /** Concurrent batch groups sent in parallel */
  private readonly CONCURRENCY = 3;
  /** Max retry attempts per failed batch before marking it failed */
  private readonly MAX_RETRIES = 2;
  /**
   * Milliseconds to wait between concurrency windows.
   * Prevents flooding the SMTP relay when processing a large list.
   */
  private readonly INTER_WINDOW_DELAY_MS = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Retry helper ────────────────────────────────────────────────────────
  /**
   * Retry an async operation up to `maxRetries` times using exponential back-off.
   * Delays: 500 ms → 1 000 ms → 2 000 ms …
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = this.MAX_RETRIES,
    baseDelayMs = 500,
  ): Promise<T> {
    let lastError: Error;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          this.logger.warn(
            `Send attempt ${attempt + 1} failed (${(err as Error).message}). Retrying in ${delay} ms…`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError!;
  }

  /** Small helper: resolves after `ms` milliseconds. */
  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Resolve and validate that a school exists; return its public profile. */
  private async resolveSchool(schoolId: string): Promise<SchoolInfo & { id: string }> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        shortName: true,
        address: true,
        state: true,
        country: true,
        website: true,
      },
    });
    if (!school) throw new NotFoundException('School not found.');
    return school;
  }

  /**
   * Build the branded HTML email body used for all outgoing communications.
   *
   * @param school       School identity (name, address, etc.)
   * @param subject      Email subject (used in the header banner)
   * @param message      Main body text (newlines converted to <br>)
   * @param greeting     Optional personalised greeting line, e.g. "Dear John Doe,"
   * @param fileUrl      Optional Cloudinary attachment URL
   */
  private buildEmailHtml(
    school: SchoolInfo,
    subject: string,
    message: string,
    greeting?: string,
    fileUrl?: string,
  ): string {
    const year = new Date().getFullYear();
    const htmlMessage = message.replace(/\n/g, '<br/>');

    const greetingBlock = greeting
      ? `<p style="font-size:15px;font-weight:500;color:#1e293b;margin-bottom:18px;">${greeting}</p>`
      : '';

    const attachmentBlock = fileUrl
      ? `<div style="margin:24px 0;padding:16px 20px;background:#f0fdf4;border:1px dashed #10b981;border-radius:10px;text-align:center;">
          <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#065f46;text-transform:uppercase;letter-spacing:.5px;">📎 Attachment Included</p>
          <a href="${fileUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:10px 24px;background:#10b981;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
            View / Download Attachment
          </a>
        </div>`
      : '';

    const displayName = school.shortName || school.name;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#334155;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f766e 0%,#10b981 100%);padding:32px 36px;text-align:center;">
              <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-.3px;">${school.name}</h1>
              ${school.shortName ? `<p style="margin:0 0 4px;font-size:13px;color:rgba(255,255,255,.8);">${school.shortName}</p>` : ''}
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,.7);">${school.address}, ${school.state}</p>
            </td>
          </tr>

          <!-- Subject banner -->
          <tr>
            <td style="background:#0f766e;padding:10px 36px;">
              <p style="margin:0;font-size:13px;font-weight:600;color:#ccfbf1;text-transform:uppercase;letter-spacing:.6px;">${subject}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 36px;">
              ${greetingBlock}
              ${attachmentBlock}
              <div style="font-size:15px;line-height:1.75;color:#334155;">
                ${htmlMessage}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 36px;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#475569;">${school.name}</p>
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">${school.address}, ${school.state}, ${school.country}</p>
              ${school.website ? `<p style="margin:0 0 12px;font-size:12px;"><a href="${school.website}" style="color:#10b981;text-decoration:none;">${school.website}</a></p>` : '<p style="margin:0 0 12px;"></p>'}
              <p style="margin:0;font-size:11px;color:#cbd5e1;">This is an official communication from <strong>${displayName}</strong>.<br/>© ${year} ${school.name}. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /** Upload an optional attachment to Cloudinary and return its URL & publicId. */
  private async uploadAttachment(
    schoolId: string,
    file?: Express.Multer.File,
  ): Promise<{ fileUrl?: string; filePublicId?: string }> {
    if (!file) return {};
    try {
      const result = await this.cloudinaryService.uploadFile(
        file,
        `schools/${schoolId}/communications`,
      );
      this.logger.log(`Attachment uploaded: ${result.secure_url}`);
      return { fileUrl: result.secure_url, filePublicId: result.public_id };
    } catch (error) {
      this.logger.error(`Cloudinary upload failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('Failed to upload the email attachment.');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PUBLIC: SEND BULK EMAIL
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Sends a branded school email to all unique recipients using BCC batching.
   *
   * Flow:
   *  1. Resolve school identity + upload attachment (parallel)
   *  2. Deduplicate recipients
   *  3. Slice into BCC batches of BATCH_SIZE
   *  4. Process CONCURRENCY batches at a time using Promise.allSettled
   *     (so a single failing batch never prevents others from reporting)
   *  5. Insert INTER_WINDOW_DELAY_MS between concurrency windows to
   *     avoid overwhelming the SMTP relay
   *  6. Persist history record and return summary
   */
  async sendBulkEmail(
    schoolId: string,
    payload: SendEmailDto,
    file?: Express.Multer.File,
  ) {
    // Resolve school identity & upload attachment in parallel (independent ops)
    const [school, { fileUrl: uploadedUrl, filePublicId: uploadedId }] = await Promise.all([
      this.resolveSchool(schoolId),
      this.uploadAttachment(schoolId, file),
    ]);

    const fileUrl = payload.fileUrl ?? uploadedUrl;
    const filePublicId = payload.filePublicId ?? uploadedId;

    // Recipients already normalised by the controller
    const uniqueRecipients = [...new Set<string>(payload.recipients)];

    const finalHtml = this.buildEmailHtml(school, payload.subject, payload.message, undefined, fileUrl);

    // Split into BCC batches
    const batches: string[][] = [];
    for (let i = 0; i < uniqueRecipients.length; i += this.BATCH_SIZE) {
      batches.push(uniqueRecipients.slice(i, i + this.BATCH_SIZE));
    }

    this.logger.log(
      `Bulk email: ${uniqueRecipients.length} recipients → ${batches.length} batch(es) ` +
      `(BATCH_SIZE=${this.BATCH_SIZE}, CONCURRENCY=${this.CONCURRENCY}) for school "${school.name}"`,
    );

    // The real sender address acts as the "To" address for BCC privacy
    const senderAddress = this.configService.get<string>('EMAIL_USER');
    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Process batches in concurrency windows with an inter-window delay
    for (let i = 0; i < batches.length; i += this.CONCURRENCY) {
      const window = batches.slice(i, i + this.CONCURRENCY);

      const results = await Promise.allSettled(
        window.map((batch) =>
          this.retryWithBackoff(() =>
            this.mailService.sendMail(
              senderAddress!,   // to: own inbox (BCC privacy pattern)
              payload.subject,
              finalHtml,
              school.name,
              batch,            // bcc: actual recipients
            ),
          ),
        ),
      );

      results.forEach((result, idx) => {
        const batch = window[idx];
        if (result.status === 'fulfilled') {
          sentCount += batch.length;
        } else {
          failedCount += batch.length;
          const reason = (result.reason as Error)?.message ?? 'Unknown error';
          errors.push(`Batch [${batch[0]}…] failed after retries: ${reason}`);
          this.logger.error(`Batch permanently failed (${batch[0]}…): ${reason}`);
        }
      });

      // Delay between windows (skip after last window)
      if (i + this.CONCURRENCY < batches.length) {
        await this.delay(this.INTER_WINDOW_DELAY_MS);
      }
    }

    const status: CommunicationStatus =
      failedCount === 0
        ? CommunicationStatus.SENT
        : sentCount > 0
          ? CommunicationStatus.PARTIAL
          : CommunicationStatus.FAILED;

    const history = await this.saveHistory(schoolId, {
      subject: payload.subject,
      message: payload.message,
      recipientType: payload.recipientType,
      recipients: uniqueRecipients,
      status,
      error: errors.length > 0 ? errors.join(' | ') : undefined,
      fileUrl,
      filePublicId,
    });

    return {
      success: status === CommunicationStatus.SENT,
      schoolName: school.name,
      message:
        status === CommunicationStatus.SENT
          ? `${school.name} — Email sent successfully to ${sentCount} recipient(s).`
          : status === CommunicationStatus.PARTIAL
            ? `${school.name} — Email partially sent: ${sentCount} delivered, ${failedCount} failed.`
            : `${school.name} — Email delivery failed for all ${failedCount} recipient(s).`,
      data: {
        sentCount,
        failedCount,
        totalRecipients: uniqueRecipients.length,
        status,
        history,
        ...(errors.length > 0 ? { errors } : {}),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PUBLIC: SEND SINGLE EMAIL
  // ═══════════════════════════════════════════════════════════════════════════
  async sendSingleEmail(
    schoolId: string,
    payload: SendSingleEmailDto,
    file?: Express.Multer.File,
  ) {
    // Resolve school identity and upload attachment concurrently (independent ops)
    const [school, { fileUrl: uploadedUrl, filePublicId: uploadedId }] = await Promise.all([
      this.resolveSchool(schoolId),
      this.uploadAttachment(schoolId, file),
    ]);

    const fileUrl = payload.fileUrl ?? uploadedUrl;
    const filePublicId = payload.filePublicId ?? uploadedId;

    const greeting = payload.recipientName
      ? `Dear ${payload.recipientName},`
      : 'Dear Recipient,';

    const finalHtml = this.buildEmailHtml(
      school,
      payload.subject,
      payload.message,
      greeting,
      fileUrl,
    );

    let status: CommunicationStatus = CommunicationStatus.SENT;
    let errorMsg: string | undefined;

    try {
      // Retry the single send up to MAX_RETRIES times
      await this.retryWithBackoff(() =>
        this.mailService.sendMail(
          payload.recipient,
          payload.subject,
          finalHtml,
          school.name,
        ),
      );
      this.logger.log(`Single email sent to ${payload.recipient} for school "${school.name}"`);
    } catch (error) {
      status = CommunicationStatus.FAILED;
      errorMsg = (error as Error).message;
      this.logger.error(`Failed to send single email to ${payload.recipient}: ${errorMsg}`);
    }

    // Always record history — even on failure
    const history = await this.saveHistory(schoolId, {
      subject: payload.subject,
      message: payload.message,
      recipientType: payload.recipientType,
      recipients: [payload.recipient],
      status,
      error: errorMsg,
      fileUrl,
      filePublicId,
    });

    return {
      success: status === CommunicationStatus.SENT,
      schoolName: school.name,
      message:
        status === CommunicationStatus.SENT
          ? `${school.name} — Email sent successfully to ${payload.recipient}.`
          : `${school.name} — Failed to deliver email to ${payload.recipient}.`,
      data: { status, history },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PUBLIC: GET HISTORY (with pagination)
  // ═══════════════════════════════════════════════════════════════════════════
  async getHistory(schoolId: string, page = 1, limit = 20) {
    // Validate school exists before querying history
    await this.resolveSchool(schoolId);

    const take = Math.min(limit, 100); // cap at 100 per page
    const skip = (page - 1) * take;

    const [data, total] = await Promise.all([
      (this.prisma as any).communication.findMany({
        where: { schoolId },
        orderBy: { timestamp: 'desc' },
        skip,
        take,
      }),
      (this.prisma as any).communication.count({ where: { schoolId } }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PUBLIC: SAVE HISTORY
  // ═══════════════════════════════════════════════════════════════════════════
  async saveHistory(schoolId: string, payload: SaveHistoryDto) {
    return (this.prisma as any).communication.create({
      data: {
        schoolId,
        subject: payload.subject,
        message: payload.message,
        recipientType: payload.recipientType,
        recipients: payload.recipients,
        status: payload.status,
        error: payload.error ?? null,
        fileUrl: payload.fileUrl ?? null,
        filePublicId: payload.filePublicId ?? null,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PUBLIC: DELETE MAIL RECORD
  // ═══════════════════════════════════════════════════════════════════════════
  async deleteMail(id: string, schoolId: string) {
    const mail = await (this.prisma as any).communication.findFirst({
      where: { id, schoolId },
    });

    if (!mail) {
      throw new NotFoundException('Communication record not found.');
    }

    // Best-effort Cloudinary cleanup — do not block DB deletion on failure
    if (mail.filePublicId) {
      try {
        await this.cloudinaryService.deleteFile(mail.filePublicId);
        this.logger.log(`Cloudinary attachment deleted: ${mail.filePublicId}`);
      } catch (error) {
        this.logger.warn(
          `Could not delete Cloudinary attachment (${mail.filePublicId}): ${(error as Error).message}`,
        );
      }
    }

    await (this.prisma as any).communication.delete({ where: { id } });

    return {
      success: true,
      message: 'Communication record deleted successfully.',
    };
  }
}
