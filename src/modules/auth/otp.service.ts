import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  private async checkEmailExists(email: string): Promise<boolean> {
    const [
      existingSuperAdmin,
      existingSchoolAdmin,
      existingTeacher,
      existingStudent,
    ] = await Promise.all([
      this.prisma.superAdmin.findUnique({ where: { email } }),
      this.prisma.schoolAdmin.findUnique({ where: { email } }),
      this.prisma.teacher.findUnique({ where: { email } }),
      this.prisma.student.findFirst({ where: { email } }),
    ]);

    return !!(
      existingSuperAdmin ||
      existingSchoolAdmin ||
      existingTeacher ||
      existingStudent
    );
  }

  async sendOtp(email: string) {
    // Check if email already exists in any user table
    const emailExists = await this.checkEmailExists(email);
    if (emailExists) {
      throw new BadRequestException('Email already exists');
    }

    const code = Math.floor(10000 + Math.random() * 90000).toString(); // 5-digit code
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Remove any existing OTPs for this email before creating a fresh one
    await this.prisma.otp.deleteMany({ where: { email } }).catch(() => null);

    // Persist the OTP to DB immediately — the HTTP response returns as soon as this completes.
    // The email is sent in the background so the caller is never blocked by the SMTP round-trip.
    await this.prisma.otp.create({
      data: { email, code, expiresAt },
    });

    this.logger.log(`OTP generated for ${email}: ${code}`);

    // Build the email content
    const schoolName = this.configService.get<string>(
      'SCHOOL_NAME',
      'School Management',
    );
    const subject = `Your ${schoolName} Onboarding Verification Code`;
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px;">
          <div style="background-color: #0891b2; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h2 style="margin: 0;">Verify Your Email</h2>
          </div>
          <div style="padding: 30px; background-color: #ffffff;">
            <p>Thank you for starting your <strong>${schoolName}</strong> onboarding. Use the code below to verify your email address:</p>
            <div style="background: #f3f4f6; padding: 20px; font-size: 32px; font-weight: bold; text-align: center; border-radius: 8px; margin: 30px 0; color: #0891b2; letter-spacing: 5px;">
              ${code}
            </div>
            <p>This code will expire in <strong>10 minutes</strong>.</p>
            <p style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px; color: #856404; margin-top: 20px;">
              <strong>Note:</strong> If you don't see this email in your inbox, please check your spam or junk folder.
            </p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">If you didn't request this, please ignore this email.</p>
          </div>
          <div style="text-align: center; padding: 20px; font-size: 12px; color: #777; background-color: #f9fafb; border-radius: 0 0 10px 10px;">
            <p>&copy; ${new Date().getFullYear()} ${schoolName}. All rights reserved.</p>
          </div>
        </div>
      `;

    // Fire-and-forget: send email in the background.
    // The OTP is already persisted, so the user can verify even if email delivery
    // is momentarily slow. Errors are logged; the user can hit "Resend" if needed.
    this.mailService
      .sendMail(email, subject, html, schoolName)
      .then(() => this.logger.log(`OTP email successfully sent to ${email}`))
      .catch((err: Error) =>
        this.logger.error(
          `OTP email delivery failed for ${email} (user can resend). Error: ${err.message}`,
          err.stack,
        ),
      );

    // Return immediately — client gets the response without waiting on SMTP
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

    // OTP is valid. Cleanup happens in clearOnboardingProgress after successful registration.
    return true;
  }
}
