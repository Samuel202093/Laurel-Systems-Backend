import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    const mailHost = this.configService.get<string>('EMAIL_HOST');
    const mailPort = this.configService.get<string>('EMAIL_PORT');
    const mailUser = this.configService.get<string>('EMAIL_USER');
    const mailPassword = this.configService.get<string>('MAILER_PASSWORD');

    this.logger.log(`Initializing MailService with host: ${mailHost} and user: ${mailUser}`);

    if (!mailHost || !mailUser || !mailPassword) {
      this.logger.error(
        'CRITICAL: Mail configuration is incomplete. Check EMAIL_HOST, EMAIL_USER, and MAILER_PASSWORD in .env',
      );
    }

    const port = Number(mailPort) || 587;
    const isSecure = port === 465; // true only for SSL; STARTTLS uses 587

    // Cast to `any` so that runtime-only options (family, pool, maxConnections, etc.)
    // that are absent from nodemailer's TS type definitions don't cause TS2769.
    const smtpConfig: any = {
      host: mailHost,
      port,
      secure: isSecure,
      requireTLS: !isSecure, // Force STARTTLS upgrade on port 587
      // Force IPv4 — Render.com does not support outbound IPv6 TCP (ENETUNREACH fix)
      family: 4,
      // Connection pooling: reuse SMTP connections instead of opening one per email
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      // Tight timeouts so failures surface quickly
      connectionTimeout: 10_000, // 10 s to establish TCP connection
      greetingTimeout: 10_000,   // 10 s for SMTP EHLO greeting
      socketTimeout: 30_000,     // 30 s idle socket timeout
      auth: {
        user: mailUser,
        pass: mailPassword,
      },
      tls: {
        rejectUnauthorized: false,
      },
    };
    this.transporter = nodemailer.createTransport(smtpConfig);

    // Verify connection configuration (runs in background — does not block startup)
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('SMTP transporter verification failed:', error.message);
      } else {
        this.logger.log('SMTP server is ready — mail will be delivered via IPv4');
      }
    });
  }

  async sendTeacherWelcomeEmail(email: string, fullName: string, staffId: string, tempPassword: string, schoolName?: string) {
    const finalSchoolName = schoolName || this.configService.get<string>('SCHOOL_NAME', 'Our School');
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

    try {
      await this.transporter.sendMail({
        from: `"${finalSchoolName}" <${senderEmail}>`,
        to: email,
        subject: `Welcome to ${finalSchoolName} - Your Login Details`,
        html,
      });
      this.logger.log(`Welcome email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}`, error.stack);
    }
  }

  async sendMail(to: string | string[], subject: string, html: string, schoolName?: string, bcc?: string | string[]) {
    const finalSchoolName = schoolName || this.configService.get<string>('SCHOOL_NAME', 'Our School');
    const senderEmail = this.configService.get<string>('EMAIL_USER');

    this.logger.log(`Attempting to send email to: ${to} from: ${senderEmail} with subject: ${subject}`);

    try {
      const result = await this.transporter.sendMail({
        from: `"${finalSchoolName}" <${senderEmail}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        bcc: Array.isArray(bcc) ? bcc.join(', ') : bcc,
        subject,
        html,
      });
      this.logger.log(`Email successfully sent to ${to}. MessageId: ${result.messageId}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}. Error: ${error.message}`, error.stack);
      throw error;
    }
  }

  async sendStudentWelcomeEmail(email: string, fullName: string, registrationNumber: string, tempPassword: string, schoolName?: string) {
    const finalSchoolName = schoolName || this.configService.get<string>('SCHOOL_NAME', 'Our School');
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

    try {
      await this.transporter.sendMail({
        from: `"${finalSchoolName}" <${senderEmail}>`,
        to: email,
        subject: `Welcome to ${finalSchoolName} - Student Account Details`,
        html,
      });
      this.logger.log(`Student welcome email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send student welcome email to ${email}`, error.stack);
    }
  }

  async sendPasswordChangeEmail(email: string, fullName: string, newPassword: string, schoolName?: string) {
    const finalSchoolName = schoolName || this.configService.get<string>('SCHOOL_NAME', 'Our School');
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
            
            <p>Please keep this information secure and do not share it with anyone.</p>
            
            <p>Best regards,<br>The Security Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${finalSchoolName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: `"${finalSchoolName}" <${senderEmail}>`,
        to: email,
        subject: `Security Alert: Your Password Has Been Changed`,
        html,
      });
      this.logger.log(`Password change notification sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password change email to ${email}`, error.stack);
    }
  }

  async sendAssignmentNotificationEmail(
    assignment: {
      title: string;
      description: string;
      dueDate: Date;
      term: string;
      assignmentType: string;
      academicSession: string;
      totalMarks?: number | null;
      fileUrl?: string | null;
      subjectName: string;
      className: string;
      teacherName: string;
    },
    students: { email: string; firstName: string; lastName: string }[],
    schoolName?: string,
  ) {
    const finalSchoolName = schoolName || this.configService.get<string>('SCHOOL_NAME', 'Our School');
    const portalUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000') + '/student/assignments';
    const senderEmail = this.configService.get<string>('EMAIL_USER');

    const formattedDueDate = new Date(assignment.dueDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const formattedDueTime = new Date(assignment.dueDate).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const assignmentTypeLabel =
      assignment.assignmentType.charAt(0).toUpperCase() +
      assignment.assignmentType.slice(1).replace(/-/g, ' ');

    const buildHtml = (studentName: string) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f6f9; }
          .wrapper { max-width: 640px; margin: 0 auto; padding: 20px; }
          .container { background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08); }
          .header { background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%); color: white; padding: 32px 30px; }
          .header h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 700; }
          .header p { margin: 0; font-size: 14px; opacity: 0.9; }
          .badge { display: inline-block; background-color: rgba(255,255,255,0.2); color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 12px; }
          .content { padding: 30px; }
          .greeting { font-size: 15px; margin-bottom: 20px; }
          .assignment-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; margin: 20px 0; }
          .assignment-title { font-size: 18px; font-weight: 700; color: #1a73e8; margin: 0 0 16px 0; }
          .detail-grid { display: table; width: 100%; border-collapse: collapse; }
          .detail-row { display: table-row; }
          .detail-label { display: table-cell; padding: 8px 12px 8px 0; font-weight: 600; color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; vertical-align: top; width: 140px; }
          .detail-value { display: table-cell; padding: 8px 0; font-size: 14px; color: #1e293b; vertical-align: top; }
          .due-date-highlight { background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 14px 18px; margin: 20px 0; display: flex; align-items: center; }
          .due-date-highlight .icon { font-size: 20px; margin-right: 12px; }
          .due-date-highlight .text { font-size: 14px; color: #9a3412; }
          .due-date-highlight .text strong { color: #7c2d12; }
          .description-section { margin: 20px 0; }
          .description-section h3 { font-size: 14px; font-weight: 600; color: #475569; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.3px; }
          .description-section p { font-size: 14px; color: #334155; background-color: #f8fafc; padding: 16px; border-radius: 8px; border-left: 3px solid #1a73e8; margin: 0; }
          .cta-section { text-align: center; margin: 28px 0 10px; }
          .button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%); color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; letter-spacing: 0.3px; }
          .divider { height: 1px; background-color: #e2e8f0; margin: 24px 0; }
          .footer { text-align: center; padding: 24px 30px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; }
          .footer p { margin: 0 0 4px 0; font-size: 12px; color: #94a3b8; }
          .footer .school-name { font-weight: 600; color: #64748b; }
          ${assignment.fileUrl ? '.attachment-notice { background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #166534; }' : ''}
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <h1>📋 New Assignment Posted</h1>
              <p>${finalSchoolName} — Academic Portal</p>
              <span class="badge">${assignmentTypeLabel}</span>
            </div>
            <div class="content">
              <p class="greeting">Dear <strong>${studentName}</strong>,</p>
              <p style="font-size: 14px; color: #475569;">A new assignment has been posted for your class by <strong>${assignment.teacherName}</strong>. Please review the details below and ensure timely submission.</p>
              
              <div class="assignment-card">
                <h2 class="assignment-title">${assignment.title}</h2>
                <div class="detail-grid">
                  <div class="detail-row">
                    <span class="detail-label">Subject</span>
                    <span class="detail-value">${assignment.subjectName}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Class</span>
                    <span class="detail-value">${assignment.className}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Type</span>
                    <span class="detail-value">${assignmentTypeLabel}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Term</span>
                    <span class="detail-value">${assignment.term}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Session</span>
                    <span class="detail-value">${assignment.academicSession}</span>
                  </div>
                  ${assignment.totalMarks ? `
                  <div class="detail-row">
                    <span class="detail-label">Total Marks</span>
                    <span class="detail-value">${assignment.totalMarks}</span>
                  </div>` : ''}
                </div>
              </div>

              <div class="due-date-highlight">
                <span class="icon">⏰</span>
                <span class="text"><strong>Due Date:</strong> ${formattedDueDate} at ${formattedDueTime}</span>
              </div>

              <div class="description-section">
                <h3>Assignment Description</h3>
                <p>${assignment.description}</p>
              </div>

              ${assignment.fileUrl ? `
              <div class="attachment-notice">
                📎 <strong>Attachment included</strong> — A file has been attached to this assignment. Log in to the portal to download it.
              </div>` : ''}

              <div class="cta-section">
                <a href="${portalUrl}" class="button">View Assignment on Portal</a>
              </div>

              <div class="divider"></div>

              <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">
                Please ensure you submit your work before the deadline. Late submissions may not be accepted. 
                If you have any questions regarding this assignment, please contact your teacher <strong>${assignment.teacherName}</strong> directly.
              </p>
            </div>
            <div class="footer">
              <p class="school-name">${finalSchoolName}</p>
              <p>&copy; ${new Date().getFullYear()} ${finalSchoolName}. All rights reserved.</p>
              <p style="margin-top: 8px;">This is an automated notification. Please do not reply to this email.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const validStudents = students.filter((s) => s.email);
    if (validStudents.length === 0) {
      this.logger.warn('No students with email addresses found for assignment notification');
      return;
    }

    this.logger.log(
      `Sending assignment notification to ${validStudents.length} student(s) for "${assignment.title}"`,
    );

    // Send emails in parallel batches to avoid overwhelming the mail server
    const BATCH_SIZE = 10;
    for (let i = 0; i < validStudents.length; i += BATCH_SIZE) {
      const batch = validStudents.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (student) => {
          try {
            await this.transporter.sendMail({
              from: `"${finalSchoolName}" <${senderEmail}>`,
              to: student.email,
              subject: `New Assignment: ${assignment.title} — ${assignment.subjectName} | ${finalSchoolName}`,
              html: buildHtml(`${student.firstName} ${student.lastName}`),
            });
            this.logger.log(`Assignment notification sent to ${student.email}`);
          } catch (error) {
            this.logger.error(
              `Failed to send assignment notification to ${student.email}: ${error.message}`,
              error.stack,
            );
          }
        }),
      );
    }

    this.logger.log(
      `Assignment notification dispatch completed for "${assignment.title}"`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  EXAM RESULTS — compiled class summary email to teacher
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Send a compiled, ranked exam results table to the teacher after students submit.
   * Can be triggered automatically after each submission or manually via the API.
   */
  async sendExamClassResultsToTeacher(payload: {
    teacher: { fullName: string; email: string };
    exam: {
      title: string;
      totalMarks: number;
      term: string;
      subject: { name: string } | null;
      class: { name: string } | null;
    };
    attempts: Array<{
      studentName: string;
      registrationNumber: string;
      score: number;
      percentage: number;
      submittedAt: Date | null;
    }>;
    school: { name: string; shortName: string | null };
  }) {
    const { teacher, exam, attempts, school } = payload;
    const senderEmail = this.configService.get<string>('EMAIL_USER');
    const schoolDisplay = school.shortName || school.name;
    const year = new Date().getFullYear();

    // Summary stats
    const totalStudents = attempts.length;
    const totalScore = attempts.reduce((sum, a) => sum + a.score, 0);
    const avgScore = totalStudents > 0 ? (totalScore / totalStudents).toFixed(2) : '0.00';
    const highestScore = totalStudents > 0 ? Math.max(...attempts.map((a) => a.score)) : 0;
    const lowestScore = totalStudents > 0 ? Math.min(...attempts.map((a) => a.score)) : 0;
    const passed = attempts.filter((a) => a.percentage >= 50).length;

    // Build ranked table rows
    const tableRows = attempts
      .map((a, idx) => {
        const passFail = a.percentage >= 50;
        const bgColor = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        const badge = passFail
          ? `<span style="color:#065f46;background:#d1fae5;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">PASS</span>`
          : `<span style="color:#991b1b;background:#fee2e2;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">FAIL</span>`;
        const formattedDate = a.submittedAt
          ? new Date(a.submittedAt).toLocaleString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })
          : '—';
        return `
          <tr style="background:${bgColor};">
            <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">${idx + 1}</td>
            <td style="padding:10px 14px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${a.studentName}</td>
            <td style="padding:10px 14px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">${a.registrationNumber}</td>
            <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#1e40af;border-bottom:1px solid #e5e7eb;">${a.score} / ${exam.totalMarks}</td>
            <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">${a.percentage}%</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">${badge}</td>
            <td style="padding:10px 14px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">${formattedDate}</td>
          </tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Exam Results — ${exam.title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#334155;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="680" cellpadding="0" cellspacing="0"
               style="max-width:680px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);padding:32px 36px;text-align:center;">
              <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-.3px;">
                📊 Exam Results Summary
              </h1>
              <p style="margin:0 0 4px;font-size:14px;color:rgba(255,255,255,.9);">${school.name}</p>
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,.7);">Compiled result sheet for your review</p>
            </td>
          </tr>

          <!-- Exam Meta -->
          <tr>
            <td style="background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:20px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:50%;padding-right:16px;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;">Exam Title</p>
                    <p style="margin:0;font-size:15px;font-weight:700;color:#1e3a8a;">${exam.title}</p>
                  </td>
                  <td style="width:50%;padding-left:16px;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;">Subject</p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:#1e40af;">${exam.subject?.name ?? '—'}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:14px;padding-right:16px;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;">Class</p>
                    <p style="margin:0;font-size:14px;color:#374151;">${exam.class?.name ?? '—'}</p>
                  </td>
                  <td style="padding-top:14px;padding-left:16px;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;">Term</p>
                    <p style="margin:0;font-size:14px;color:#374151;">${exam.term}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Stats Cards -->
          <tr>
            <td style="padding:24px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="20%" style="text-align:center;padding:0 4px;">
                    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 8px;">
                      <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#16a34a;">${totalStudents}</p>
                      <p style="margin:0;font-size:11px;color:#4b5563;font-weight:600;">Submitted</p>
                    </div>
                  </td>
                  <td width="20%" style="text-align:center;padding:0 4px;">
                    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 8px;">
                      <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#1d4ed8;">${avgScore}</p>
                      <p style="margin:0;font-size:11px;color:#4b5563;font-weight:600;">Avg Score</p>
                    </div>
                  </td>
                  <td width="20%" style="text-align:center;padding:0 4px;">
                    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px 8px;">
                      <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#ea580c;">${highestScore}</p>
                      <p style="margin:0;font-size:11px;color:#4b5563;font-weight:600;">Highest</p>
                    </div>
                  </td>
                  <td width="20%" style="text-align:center;padding:0 4px;">
                    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 8px;">
                      <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#dc2626;">${lowestScore}</p>
                      <p style="margin:0;font-size:11px;color:#4b5563;font-weight:600;">Lowest</p>
                    </div>
                  </td>
                  <td width="20%" style="text-align:center;padding:0 4px;">
                    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 8px;">
                      <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#15803d;">${passed}</p>
                      <p style="margin:0;font-size:11px;color:#4b5563;font-weight:600;">Passed</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:0 36px 16px;">
              <p style="margin:0;font-size:15px;color:#374151;">
                Dear <strong>${teacher.fullName}</strong>,<br/>
                Below is the ranked result sheet for <strong>${exam.title}</strong>.
                A total of <strong>${totalStudents}</strong> student(s) have submitted their answers.
              </p>
            </td>
          </tr>

          <!-- Results Table -->
          <tr>
            <td style="padding:0 36px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                <thead>
                  <tr style="background:#1d4ed8;">
                    <th style="padding:12px 14px;text-align:left;font-size:12px;font-weight:600;color:#e0e7ff;text-transform:uppercase;letter-spacing:.4px;">#</th>
                    <th style="padding:12px 14px;text-align:left;font-size:12px;font-weight:600;color:#e0e7ff;text-transform:uppercase;letter-spacing:.4px;">Student Name</th>
                    <th style="padding:12px 14px;text-align:left;font-size:12px;font-weight:600;color:#e0e7ff;text-transform:uppercase;letter-spacing:.4px;">Reg. No.</th>
                    <th style="padding:12px 14px;text-align:left;font-size:12px;font-weight:600;color:#e0e7ff;text-transform:uppercase;letter-spacing:.4px;">Score</th>
                    <th style="padding:12px 14px;text-align:left;font-size:12px;font-weight:600;color:#e0e7ff;text-transform:uppercase;letter-spacing:.4px;">%</th>
                    <th style="padding:12px 14px;text-align:left;font-size:12px;font-weight:600;color:#e0e7ff;text-transform:uppercase;letter-spacing:.4px;">Status</th>
                    <th style="padding:12px 14px;text-align:left;font-size:12px;font-weight:600;color:#e0e7ff;text-transform:uppercase;letter-spacing:.4px;">Submitted At</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 36px;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#475569;">${school.name}</p>
              <p style="margin:0 0 12px;font-size:12px;color:#94a3b8;">This is an automated results summary from your school portal.</p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;">© ${year} ${school.name}. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      await this.transporter.sendMail({
        from: `"${schoolDisplay}" <${senderEmail}>`,
        to: teacher.email,
        subject: `📊 Exam Results: ${exam.title} — ${exam.class?.name ?? ''} | ${schoolDisplay}`,
        html,
      });
      this.logger.log(
        `Exam class results email sent to ${teacher.email} for "${exam.title}" (${totalStudents} students)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send exam results email to ${teacher.email}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
