import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    const mailHost = this.configService.get<string>('EMAIL_HOST');
    const mailPort = this.configService.get<number>('EMAIL_PORT');
    const mailUser = this.configService.get<string>('EMAIL_USER');
    const mailPassword = this.configService.get<string>('MAILER_PASSWORD');

    this.logger.log(`Initializing MailService with host: ${mailHost} and user: ${mailUser}`);

    this.transporter = nodemailer.createTransport({
      host: mailHost,
      port: mailPort,
      secure: mailPort === 465, // true for 465, false for other ports (like 587)
      // family: 4,
      auth: {
        user: mailUser,
        pass: mailPassword,
      },
    });

    // Verify connection configuration
    this.transporter.verify((error, success) => {
      if (error) {
        this.logger.error('Transporter verification failed:', error);
      } else {
        this.logger.log('Mail server is ready to take our messages');
      }
    });
  }

  async sendTeacherWelcomeEmail(email: string, fullName: string, staffId: string, tempPassword: string) {
    const schoolName = this.configService.get<string>('SCHOOL_NAME', 'Our School');
    const loginUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000') + '/login';
    const senderEmail = this.configService.get<string>('EMAIL_USER');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; }
          .header { background-color: #4A90E2; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background-color: #ffffff; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #777; }
          .button { display: inline-block; padding: 12px 25px; background-color: #4A90E2; color: white !important; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
          .credentials { background-color: #f9f9f9; padding: 20px; border-left: 4px solid #4A90E2; margin: 20px 0; }
          .credential-item { margin-bottom: 10px; }
          .label { font-weight: bold; color: #555; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${schoolName}</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${fullName}</strong>,</p>
            <p>Welcome to the team! You have been registered as a staff member at <strong>${schoolName}</strong>. Your account has been created successfully.</p>
            
            <p>Please use the credentials below to log in to the school management portal:</p>
            
            <div class="credentials">
              <div class="credential-item">
                <span class="label">Staff ID:</span> <span>${staffId}</span>
              </div>
              <div class="credential-item">
                <span class="label">Email:</span> <span>${email}</span>
              </div>
              <div class="credential-item">
                <span class="label">Temporary Password:</span> <span>${tempPassword}</span>
              </div>
            </div>
            
            <p>For security reasons, we recommend that you change your password immediately after your first login.</p>
            
            <div style="text-align: center;">
              <a href="${loginUrl}" class="button">Log In to Portal</a>
            </div>
            
            <p style="margin-top: 30px;">If you have any questions or encounter any issues, please contact the IT department.</p>
            
            <p>Best regards,<br>The Administration Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${schoolName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: `"${schoolName}" <${senderEmail}>`,
        to: email,
        subject: `Welcome to ${schoolName} - Your Login Details`,
        html,
      });
      this.logger.log(`Welcome email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}`, error.stack);
    }
  }

  async sendStudentWelcomeEmail(email: string, fullName: string, registrationNumber: string, tempPassword: string) {
    const schoolName = this.configService.get<string>('SCHOOL_NAME', 'Our School');
    const loginUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000') + '/login';
    const senderEmail = this.configService.get<string>('EMAIL_USER');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background-color: #ffffff; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #777; }
          .button { display: inline-block; padding: 12px 25px; background-color: #4CAF50; color: white !important; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
          .credentials { background-color: #f9f9f9; padding: 20px; border-left: 4px solid #4CAF50; margin: 20px 0; }
          .credential-item { margin-bottom: 10px; }
          .label { font-weight: bold; color: #555; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${schoolName}</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${fullName}</strong>,</p>
            <p>Welcome! You have been registered as a student at <strong>${schoolName}</strong>. Your account has been created successfully.</p>
            
            <p>Please use the credentials below to log in to the school portal:</p>
            
            <div class="credentials">
              <div class="credential-item">
                <span class="label">Registration Number:</span> <span>${registrationNumber}</span>
              </div>
              <div class="credential-item">
                <span class="label">Email:</span> <span>${email}</span>
              </div>
              <div class="credential-item">
                <span class="label">Temporary Password:</span> <span>${tempPassword}</span>
              </div>
            </div>
            
            <p>For security reasons, we recommend that you change your password immediately after your first login.</p>
            
            <div style="text-align: center;">
              <a href="${loginUrl}" class="button">Log In to Portal</a>
            </div>
            
            <p style="margin-top: 30px;">If you have any questions, please contact the school administration.</p>
            
            <p>Best regards,<br>The Administration Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${schoolName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: `"${schoolName}" <${senderEmail}>`,
        to: email,
        subject: `Welcome to ${schoolName} - Student Account Details`,
        html,
      });
      this.logger.log(`Student welcome email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send student welcome email to ${email}`, error.stack);
    }
  }

  async sendPasswordChangeEmail(email: string, fullName: string, newPassword: string) {
    const schoolName = this.configService.get<string>('SCHOOL_NAME', 'Our School');
    const senderEmail = this.configService.get<string>('EMAIL_USER');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; }
          .header { background-color: #f44336; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background-color: #ffffff; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #777; }
          .alert { background-color: #fff3e0; padding: 15px; border-left: 4px solid #ff9800; margin: 20px 0; }
          .credentials { background-color: #f9f9f9; padding: 20px; border-left: 4px solid #f44336; margin: 20px 0; }
          .credential-item { margin-bottom: 10px; }
          .label { font-weight: bold; color: #555; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Security Update</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${fullName}</strong>,</p>
            <p>This is to inform you that the password for your account at <strong>${schoolName}</strong> has been successfully changed.</p>
            
            <div class="alert">
              <p><strong>Warning:</strong> If you did not initiate this change, please contact the school administration or IT support immediately as your account may be compromised.</p>
            </div>

            <p>For your records, your new login details are:</p>
            
            <div class="credentials">
              <div class="credential-item">
                <span class="label">Email:</span> <span>${email}</span>
              </div>
              <div class="credential-item">
                <span class="label">New Password:</span> <span>${newPassword}</span>
              </div>
            </div>
            
            <p>Please keep this information secure and do not share it with anyone.</p>
            
            <p>Best regards,<br>The Security Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${schoolName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: `"${schoolName}" <${senderEmail}>`,
        to: email,
        subject: `Security Alert: Your Password Has Been Changed`,
        html,
      });
      this.logger.log(`Password change notification sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password change email to ${email}`, error.stack);
    }
  }
}
