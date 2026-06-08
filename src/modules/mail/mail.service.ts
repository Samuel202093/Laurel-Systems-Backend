import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);
  private readonly fromAddress: string;

  constructor(private configService: ConfigService) {
    this.fromAddress = this.configService.get<string>('EMAIL_FROM') ?? '';

    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
      // force IPv4 — this is the key fix for Render
      family: 4,
    } as any);

    this.logger.log(`MailService initialised — from: ${this.fromAddress}`);
  }
  
  // keep the rest of your methods exactly the same,
  // just replace this.resend.emails.send(...) in sendMail() with:
  async sendMail(
    to: string | string[],
    subject: string,
    html: string,
    schoolName?: string,
    bcc?: string | string[],
  ) {
    const finalSchoolName = schoolName ?? 'School Management System';
    const recipients = Array.isArray(to) ? to.join(', ') : to;
    const bccRecipients = bcc
      ? Array.isArray(bcc)
        ? bcc.join(', ')
        : bcc
      : undefined;

    await this.transporter.sendMail({
      from: `${finalSchoolName} <${this.fromAddress}>`,
      to: recipients,
      bcc: bccRecipients,
      subject,
      html,
    });
  }
}