import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly resend: Resend;
  private readonly logger = new Logger(MailService.name);
  private readonly fromAddress: string;
  private readonly schoolName: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }

    this.resend = new Resend(apiKey);
    this.fromAddress = this.configService.get<string>('EMAIL_FROM') ?? '';
    this.schoolName = this.configService.get<string>(
      'SCHOOL_NAME',
      'School Management System',
    );

    this.logger.log(`MailService initialised — from: ${this.fromAddress}`);
  }

  async sendMail(
    to: string | string[],
    subject: string,
    html: string,
    schoolName?: string,
    bcc?: string | string[],
  ) {
    const finalSchoolName = schoolName ?? this.schoolName;
    const recipients = Array.isArray(to) ? to : [to];
    const bccRecipients = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined;

    this.logger.log(
      `Attempting to send email to: ${recipients.join(', ')} | subject: ${subject}`,
    );

    try {
      const result = await this.resend.emails.send({
        from: `${finalSchoolName} <${this.fromAddress}>`,
        to: recipients,
        ...(bccRecipients && { bcc: bccRecipients }),
        subject,
        html,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      this.logger.log(`Email sent successfully. Id: ${result.data?.id}`);
      return result;
    } catch (error: any) {
      this.logger.error(
        `Failed to send email to ${recipients.join(', ')}. Error: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async sendTeacherWelcomeEmail(
    email: string,
    fullName: string,
    staffId: string,
    tempPassword: string,
    schoolName?: string,
  ) {
    const finalSchoolName =
      schoolName || this.configService.get<string>('SCHOOL_NAME', 'Our School');
    const loginUrl =
      this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000') +
      '/login';

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
            <h1>Welcome to ${finalSchoolName}</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${fullName}</strong>,</p>
            <p>Welcome to the team! You have been registered as a staff member at <strong>${finalSchoolName}</strong>. Your account has been created successfully.</p>
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
            <p>&copy; ${new Date().getFullYear()} ${finalSchoolName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail(
      email,
      `Welcome to ${finalSchoolName} - Your Login Details`,
      html,
      finalSchoolName,
    );
  }

  async sendStudentWelcomeEmail(
    email: string,
    fullName: string,
    registrationNumber: string,
    tempPassword: string,
    schoolName?: string,
  ) {
    const finalSchoolName =
      schoolName || this.configService.get<string>('SCHOOL_NAME', 'Our School');
    const loginUrl =
      this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000') +
      '/login';

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
          .highlight { color: #4CAF50; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${finalSchoolName}</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${fullName}</strong>,</p>
            <p>Welcome! You have been registered as a student at <strong>${finalSchoolName}</strong>. Your account has been created successfully.</p>
            <p>To access the school portal, please <span class="highlight">login with your Registration Number and Password</span> provided below:</p>
            <div class="credentials">
              <div class="credential-item">
                <span class="label">Registration Number:</span> <span class="highlight">${registrationNumber}</span>
              </div>
              <div class="credential-item">
                <span class="label">Email:</span> <span>${email}</span>
              </div>
              <div class="credential-item">
                <span class="label">Temporary Password:</span> <span class="highlight">${tempPassword}</span>
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
            <p>&copy; ${new Date().getFullYear()} ${finalSchoolName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail(
      email,
      `Welcome to ${finalSchoolName} - Student Account Details`,
      html,
      finalSchoolName,
    );
  }

  async sendPasswordChangeEmail(
    email: string,
    fullName: string,
    newPassword: string,
    schoolName?: string,
  ) {
    const finalSchoolName =
      schoolName || this.configService.get<string>('SCHOOL_NAME', 'Our School');

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
            <p>This is to inform you that the password for your account at <strong>${finalSchoolName}</strong> has been successfully changed.</p>
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
            <p>Best regards,<br>The Administration Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${finalSchoolName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail(
      email,
      `Security Update - Password Changed`,
      html,
      finalSchoolName,
    );
  }

  async sendAssignmentNotificationEmail(
    assignmentInfo: any,
    students: any[],
    schoolName?: string,
  ) {
    const finalSchoolName = schoolName || 'Our School';
    const studentEmails = students.map((s) => s.email);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background-color: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">New Assignment Posted</h2>
        </div>
        <div style="padding: 20px;">
          <p>Hello Student,</p>
          <p>A new assignment has been posted for <strong>${assignmentInfo.subjectName}</strong> in <strong>${assignmentInfo.className}</strong>.</p>
          <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Title:</strong> ${assignmentInfo.title}</p>
            <p><strong>Type:</strong> ${assignmentInfo.assignmentType}</p>
            <p><strong>Due Date:</strong> ${new Date(assignmentInfo.dueDate).toLocaleDateString()}</p>
            <p><strong>Total Marks:</strong> ${assignmentInfo.totalMarks || 'N/A'}</p>
            <p><strong>Teacher:</strong> ${assignmentInfo.teacherName}</p>
          </div>
          <p><strong>Description:</strong></p>
          <p>${assignmentInfo.description}</p>
          ${assignmentInfo.fileUrl ? `<p><a href="${assignmentInfo.fileUrl}" style="color: #4f46e5; font-weight: bold;">Download Attachment</a></p>` : ''}
          <p>Please log in to the portal to view more details and submit your work.</p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px; border-top: 1px solid #e0e0e0;">
          <p>&copy; ${new Date().getFullYear()} ${finalSchoolName}. All rights reserved.</p>
        </div>
      </div>
    `;

    return this.sendMail(
      studentEmails,
      `New Assignment: ${assignmentInfo.title}`,
      html,
      finalSchoolName,
    );
  }

  async sendExamClassResultsToTeacher(data: {
    teacher: { fullName: string; email: string };
    exam: {
      title: string;
      totalMarks: number;
      subject: any;
      class: any;
      term: string;
    };
    attempts: any[];
    school: { name: string; shortName: string | null };
  }) {
    const { teacher, exam, attempts, school } = data;
    const finalSchoolName = school.name;

    const attemptsHtml = attempts
      .map(
        (a) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${a.studentName}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${a.registrationNumber}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${a.score} / ${exam.totalMarks}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${a.percentage}%</td>
      </tr>
    `,
      )
      .join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background-color: #059669; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Exam Results Summary</h2>
          <p style="margin: 5px 0 0;">${exam.title} - ${exam.subject?.name || 'N/A'} (${exam.class?.name || 'N/A'})</p>
        </div>
        <div style="padding: 20px;">
          <p>Dear ${teacher.fullName},</p>
          <p>Students have completed the CBT exam. Here is a summary of the results:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background-color: #f9fafb;">
                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #eee;">Student Name</th>
                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #eee;">Reg Number</th>
                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #eee;">Score</th>
                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #eee;">Percentage</th>
              </tr>
            </thead>
            <tbody>
              ${attemptsHtml}
            </tbody>
          </table>
          <p>Log in to the management portal for a detailed breakdown and to export results.</p>
        </div>
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px; border-top: 1px solid #e0e0e0;">
          <p>&copy; ${new Date().getFullYear()} ${finalSchoolName}. All rights reserved.</p>
        </div>
      </div>
    `;

    return this.sendMail(
      teacher.email,
      `Exam Results: ${exam.title} (${exam.class?.name})`,
      html,
      finalSchoolName,
    );
  }
}
