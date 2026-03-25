import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

@Injectable()
export class OtpService {
  private transporter: nodemailer.Transporter;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('EMAIL_HOST'),
      port: this.configService.get<number>('EMAIL_PORT'),
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('MAILER_PASSWORD'),
      },
    });
  }

  async sendOtp(email: string) {
    const code = Math.floor(10000 + Math.random() * 90000).toString(); // 5-digit code
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.otp.create({
      data: {
        email,
        code,
        expiresAt,
      },
    });

    // For development, log the code.
    console.log(`OTP for ${email}: ${code}`);

    try {
      await this.transporter.sendMail({
        from: `"School Management" <${this.configService.get<string>('EMAIL_USER')}>`,
        to: email,
        subject: 'Your School Onboarding Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #0891b2;">Verify Your Email</h2>
            <p>Thank you for starting your school onboarding. Use the code below to verify your email address:</p>
            <div style="background: #f3f4f6; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; border-radius: 8px; margin: 20px 0;">
              ${code}
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
        `,
      });
      console.log(`Email successfully sent to ${email}`);
    } catch (error) {
      console.error('Failed to send email:', error);
      throw new BadRequestException(`Failed to send verification email: ${error.message}`);
    }

    return { expiresAt: expiresAt.getTime() };
  }

  async resendOtp(email: string) {
    // Optional: Add rate limiting here if needed
    return this.sendOtp(email);
  }

  async verifyOtp(email: string, code: string) {
    const otp = await this.prisma.otp.findFirst({
      where: {
        email,
        code,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Delete the OTP after successful verification
    await this.prisma.otp.delete({ where: { id: otp.id } });

    return true;
  }
}
