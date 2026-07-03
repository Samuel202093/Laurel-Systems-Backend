import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { MailService } from '../mail/mail.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { ResultStatus } from '@prisma/client';
import { ApproveExamDto } from './dto/approve-exam.dto';

/** Roles that have school-admin level access */
const ADMIN_ROLES = [
  'SCHOOL_ADMIN',
  'SCHOOL-ADMIN',
  'SCHOOL_OWNER',
  'DIRECTOR',
  'PRINCIPAL',
  'ICT_ADMIN',
  'SUB_ADMIN',
];

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  /**
   * In-memory debounce map: examId → timestamp of last teacher notification.
   * Prevents sending a flood of emails when many students submit simultaneously.
   * Keyed by examId; value is the epoch ms of the last send.
   */
  private readonly lastNotifiedAt = new Map<string, number>();
  /** Minimum gap (ms) between successive teacher notifications for the same exam */
  private readonly NOTIFY_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private mailService: MailService,
  ) {}

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /** True if the JWT user has an admin-level role or sub-role. */
  private isAdmin(user: any): boolean {
    const role: string = (user.role ?? '').toUpperCase().replace(/[-\s]/g, '_');
    const subRole: string = (user.subRole ?? '')
      .toUpperCase()
      .replace(/[-\s]/g, '_');
    const normalised = ADMIN_ROLES.map((r) =>
      r.toUpperCase().replace(/[-\s]/g, '_'),
    );
    return (
      normalised.includes(role) ||
      normalised.includes(subRole) ||
      role === 'SUPER_ADMIN'
    );
  }

  /** Ensure the user is either the exam's teacher OR a school-admin. */
  private async assertExamOwnerOrAdmin(examId: string, user: any) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, teacherId: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    const isOwner = user.role === 'TEACHER' && exam.teacherId === user.sub;
    if (!isOwner && !this.isAdmin(user)) {
      throw new ForbiddenException(
        'You are not authorized to perform this action',
      );
    }
    return exam;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CREATE EXAM
  // ═══════════════════════════════════════════════════════════════════════════
  async createExam(dto: CreateExamDto, files: Express.Multer.File[]) {
    try {
      const { questions, ...examData } = dto;

      const [school, teacher, subject, studentClass] = await Promise.all([
        this.prisma.school.findUnique({ where: { id: examData.schoolId } }),
        this.prisma.teacher.findUnique({ where: { id: examData.teacherId } }),
        this.prisma.subject.findUnique({ where: { id: examData.subjectId } }),
        this.prisma.class.findUnique({ where: { id: examData.classId } }),
      ]);

      if (!school) throw new NotFoundException('School not found');
      if (!teacher) throw new NotFoundException('Teacher not found');
      if (!subject) throw new NotFoundException('Subject not found');
      if (!studentClass) throw new NotFoundException('Class not found');

      if (!examData.sessionId) {
        const activeSession = await this.prisma.academicSession.findFirst({
          where: { schoolId: school.id, isActive: true },
          select: { id: true },
        });
        examData.sessionId = activeSession?.id;
      }

      const cloudinaryFolder = `schools/${school.id}/exams/${examData.title.replace(/\s+/g, '_')}`;
      let currentFileIndex = 0;

      const questionsWithImages = await Promise.all(
        questions.map(async (q) => {
          const updatedQuestion = { ...q };

          if (!q.imageUrl && q.hasImage && files && files[currentFileIndex]) {
            const file = files[currentFileIndex++];
            try {
              const uploadRes = await this.cloudinary.uploadFile(
                file,
                cloudinaryFolder,
              );
              updatedQuestion.imageUrl = uploadRes.secure_url;
              updatedQuestion.imagePublicId = uploadRes.public_id;
            } catch (error) {
              this.logger.error(
                `Failed to upload image for question: ${q.questionText}`,
                error,
              );
            }
          }

          if (q.options && Array.isArray(q.options)) {
            // Upload option images in parallel within each question
            updatedQuestion.options = await Promise.all(
              q.options.map(async (opt: any) => {
                const updatedOpt = { ...opt };
                if (
                  !opt.imageUrl &&
                  opt.hasImage &&
                  files &&
                  files[currentFileIndex]
                ) {
                  const file = files[currentFileIndex++];
                  try {
                    const uploadRes = await this.cloudinary.uploadFile(
                      file,
                      cloudinaryFolder,
                    );
                    updatedOpt.imageUrl = uploadRes.secure_url;
                    updatedOpt.imagePublicId = uploadRes.public_id;
                  } catch (error) {
                    this.logger.error(
                      `Failed to upload image for option: ${opt.label}`,
                      error,
                    );
                  }
                }
                return updatedOpt;
              }),
            );
          }

          return updatedQuestion;
        }),
      );

      return await this.prisma.$transaction(async (tx) => {
        const exam = await tx.exam.create({
          data: {
            ...examData,
            questions: {
              create: questionsWithImages.map((q) => ({
                questionText: q.questionText,
                options: q.options as any,
                correctAnswer: q.correctAnswer,
                marks: q.marks,
                imageUrl: q.imageUrl,
                imagePublicId: q.imagePublicId,
              })),
            },
          },
          include: {
            questions: true,
            subject: { select: { name: true, code: true } },
            class: { select: { name: true } },
            school: { select: { name: true, shortName: true } },
          },
        });

        return exam;
      });
    } catch (error) {
      this.logger.error('Error creating exam', error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to create exam');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  QUESTIONS — view / edit / delete  (teacher owner or admin)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * List all questions for an exam.
   * Accessible by: the teacher who created the exam, OR any school-admin
   * (SCHOOL_ADMIN, DIRECTOR, ICT_ADMIN, PRINCIPAL, SCHOOL_OWNER, SUB_ADMIN).
   */
  async getExamQuestions(examId: string, user: any) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: true,
        subject: { select: { name: true, code: true } },
        class: { select: { name: true } },
        teacher: { select: { fullName: true } },
        school: { select: { name: true, shortName: true } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    const isOwner = user.role === 'TEACHER' && exam.teacherId === user.sub;
    if (!isOwner && !this.isAdmin(user)) {
      throw new ForbiddenException(
        'You are not authorized to view these questions',
      );
    }

    return exam;
  }

  /**
   * Delete a single question and its Cloudinary assets.
   * Accessible by: teacher owner or any admin role.
   * Option images are deleted in parallel for efficiency.
   */
  async deleteQuestion(examId: string, questionId: string, user?: any) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { exam: { select: { teacherId: true } } },
    });

    if (!question) throw new NotFoundException('Question not found');

    if (user) {
      const isOwner =
        user.role === 'TEACHER' && question.exam.teacherId === user.sub;
      if (!isOwner && !this.isAdmin(user)) {
        throw new ForbiddenException(
          'You are not authorized to delete this question',
        );
      }
    }

    // Collect all public IDs to delete from Cloudinary in parallel
    const publicIdsToDelete: string[] = [];
    if (question.imagePublicId) publicIdsToDelete.push(question.imagePublicId);
    if (question.options) {
      const options = question.options as any[];
      options.forEach((opt) => {
        if (opt.imagePublicId) publicIdsToDelete.push(opt.imagePublicId);
      });
    }

    // Delete all Cloudinary assets in parallel (non-blocking on partial failure)
    if (publicIdsToDelete.length > 0) {
      await Promise.allSettled(
        publicIdsToDelete.map((pid) =>
          this.cloudinary
            .deleteFile(pid)
            .catch((err) =>
              this.logger.warn(
                `Failed to delete Cloudinary asset ${pid}: ${err.message}`,
              ),
            ),
        ),
      );
    }

    await this.prisma.question.delete({ where: { id: questionId } });
    return { success: true, message: 'Question deleted successfully' };
  }

  /**
   * Edit a question's text, options, marks, or image.
   * Accessible by: teacher owner or any admin role.
   */
  async updateQuestion(
    examId: string,
    questionId: string,
    updates: any,
    user?: any,
    file?: Express.Multer.File,
  ) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { exam: true },
    });

    if (!question) throw new NotFoundException('Question not found');

    if (user) {
      const isOwner =
        user.role === 'TEACHER' && question.exam.teacherId === user.sub;
      if (!isOwner && !this.isAdmin(user)) {
        throw new ForbiddenException(
          'You are not authorized to edit this question',
        );
      }
    }

    let { imageUrl, imagePublicId } = question;

    if (file) {
      // Delete old image and upload new one in parallel where possible
      const folder = `schools/${question.exam.schoolId}/exams/${question.exam.title.replace(/\s+/g, '_')}`;
      const [, uploadRes] = await Promise.all([
        imagePublicId
          ? this.cloudinary
              .deleteFile(imagePublicId)
              .catch((e) =>
                this.logger.warn(`Old image delete failed: ${e.message}`),
              )
          : Promise.resolve(),
        this.cloudinary.uploadFile(file, folder),
      ]);
      imageUrl = uploadRes.secure_url;
      imagePublicId = uploadRes.public_id;
    }

    return this.prisma.question.update({
      where: { id: questionId },
      data: { ...updates, imageUrl, imagePublicId },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  EXAM ATTEMPTS — view / edit / delete
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get all student attempts for an exam (teacher owner or admin). */
  async getExamAttempts(examId: string, user: any) {
    await this.assertExamOwnerOrAdmin(examId, user);

    const [exam, attempts] = await Promise.all([
      this.prisma.exam.findUnique({
        where: { id: examId },
        include: {
          subject: { select: { name: true, code: true } },
          class: { select: { name: true } },
          teacher: { select: { fullName: true } },
          school: { select: { name: true, shortName: true } },
        },
      }),
      this.prisma.examAttempt.findMany({
        where: { examId },
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              registrationNumber: true,
            },
          },
        },
        orderBy: [{ status: 'asc' }, { score: 'desc' }],
      }),
    ]);

    const submitted = attempts.filter((a) => a.status === 'SUBMITTED');
    const inProgress = attempts.filter((a) => a.status === 'IN_PROGRESS');

    const totalScore = submitted.reduce((sum, a) => sum + (a.score ?? 0), 0);
    const avgScore =
      submitted.length > 0 ? +(totalScore / submitted.length).toFixed(2) : 0;
    const highestScore =
      submitted.length > 0
        ? Math.max(...submitted.map((a) => a.score ?? 0))
        : 0;
    const lowestScore =
      submitted.length > 0
        ? Math.min(...submitted.map((a) => a.score ?? 0))
        : 0;

    // Rank submitted attempts by score descending
    const rankedAttempts = attempts.map((a) => {
      if (a.status !== 'SUBMITTED')
        return { ...a, rank: null, percentage: null };
      const rank =
        submitted.filter((s) => (s.score ?? 0) > (a.score ?? 0)).length + 1;
      const percentage = exam?.totalMarks
        ? +(((a.score ?? 0) / exam.totalMarks) * 100).toFixed(2)
        : null;
      return { ...a, rank, percentage };
    });

    return {
      exam,
      summary: {
        totalAttempts: attempts.length,
        submitted: submitted.length,
        inProgress: inProgress.length,
        averageScore: avgScore,
        highestScore,
        lowestScore,
      },
      attempts: rankedAttempts,
    };
  }

  /** Teacher or admin updates a student's exam attempt (e.g., override score, add remark). */
  async updateExamAttempt(
    examId: string,
    attemptId: string,
    updates: any,
    user: any,
  ) {
    const attempt = await this.prisma.examAttempt.findFirst({
      where: { id: attemptId, examId },
      include: { exam: { select: { teacherId: true } } },
    });
    if (!attempt) throw new NotFoundException('Exam attempt not found');

    const isOwner =
      user.role === 'TEACHER' && attempt.exam.teacherId === user.sub;
    if (!isOwner && !this.isAdmin(user)) {
      throw new ForbiddenException(
        'You are not authorized to edit this exam result',
      );
    }

    // Only allow updating score and a custom remark; never mutate status
    const allowedUpdates: any = {};
    if (typeof updates.score === 'number') allowedUpdates.score = updates.score;
    if (typeof updates.remark === 'string')
      allowedUpdates.remark = updates.remark;

    const updated = await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: allowedUpdates,
      include: {
        student: {
          select: { firstName: true, lastName: true, registrationNumber: true },
        },
      },
    });

    return { success: true, message: 'Exam attempt updated', data: updated };
  }

  /** Teacher or admin deletes a student's exam attempt record. */
  async deleteExamAttempt(examId: string, attemptId: string, user: any) {
    const attempt = await this.prisma.examAttempt.findFirst({
      where: { id: attemptId, examId },
      include: { exam: { select: { teacherId: true } } },
    });
    if (!attempt) throw new NotFoundException('Exam attempt not found');

    const isOwner =
      user.role === 'TEACHER' && attempt.exam.teacherId === user.sub;
    if (!isOwner && !this.isAdmin(user)) {
      throw new ForbiddenException(
        'You are not authorized to delete this exam result',
      );
    }

    await this.prisma.examAttempt.delete({ where: { id: attemptId } });
    return { success: true, message: 'Exam attempt deleted successfully' };
  }

  /**
   * Compile all submitted results for an exam and send to the teacher.
   * Can be triggered manually by the teacher or an admin via POST /:examId/notify-teacher.
   * The debounce guard is bypassed for manual triggers so the teacher can
   * always force a fresh email from the UI.
   */
  async sendExamResultsToTeacher(examId: string, user: any) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        teacher: { select: { fullName: true, email: true } },
        school: { select: { name: true, shortName: true } },
        subject: { select: { name: true } },
        class: { select: { name: true } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    const isOwner = user.role === 'TEACHER' && exam.teacherId === user.sub;
    if (!isOwner && !this.isAdmin(user)) {
      throw new ForbiddenException(
        'You are not authorized to trigger this notification',
      );
    }

    if (!exam.teacher?.email) {
      throw new BadRequestException(
        'Teacher email not found. Cannot send results.',
      );
    }

    const attempts = await this.prisma.examAttempt.findMany({
      where: { examId, status: 'SUBMITTED' },
      include: {
        student: {
          select: { firstName: true, lastName: true, registrationNumber: true },
        },
      },
      orderBy: { score: 'desc' },
    });

    if (attempts.length === 0) {
      return {
        success: false,
        message: 'No submitted attempts found for this exam.',
      };
    }

    await this.mailService.sendExamClassResultsToTeacher({
      teacher: exam.teacher as { fullName: string; email: string },
      exam: {
        title: exam.title,
        totalMarks: exam.totalMarks,
        subject: exam.subject,
        class: exam.class,
        term: exam.term,
      },
      attempts: attempts.map((a) => ({
        studentName: `${a.student.firstName} ${a.student.lastName}`,
        registrationNumber: a.student.registrationNumber,
        score: a.score ?? 0,
        percentage: exam.totalMarks
          ? +(((a.score ?? 0) / exam.totalMarks) * 100).toFixed(2)
          : 0,
        submittedAt: a.endTime,
      })),
      school: exam.school as { name: string; shortName: string | null },
    });

    // Reset debounce so the next automatic notification starts fresh
    this.lastNotifiedAt.set(examId, Date.now());

    return {
      success: true,
      message: `Exam results for ${attempts.length} student(s) sent to ${exam.teacher.email}`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  VERIFY EXAM KEY
  // ═══════════════════════════════════════════════════════════════════════════
  async verifyExamKey(
    examId: string,
    examKey: string,
    schoolId: string,
    classId: string,
  ) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, schoolId, classId },
      select: { examKey: true },
    });

    if (!exam)
      throw new NotFoundException('Exam not found for this school and class');

    if (exam.examKey && exam.examKey !== examKey) {
      throw new ForbiddenException('Invalid exam key');
    }

    return { success: true, message: 'Exam key verified successfully' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  START EXAM
  // ═══════════════════════════════════════════════════════════════════════════
  async startExam(examId: string, studentId: string) {
    const [exam, existingAttempt] = await Promise.all([
      this.prisma.exam.findUnique({
        where: { id: examId },
        select: {
          id: true,
          status: true,
          durationMinutes: true,
          title: true,
          instructions: true,
          totalQuestions: true,
          totalMarks: true,
          // correctAnswer is intentionally excluded — students must not see it
          questions: {
            select: {
              id: true,
              questionText: true,
              options: true,
              marks: true,
              imageUrl: true,
            },
          },
        },
      }),
      this.prisma.examAttempt.findUnique({
        where: { examId_studentId: { examId, studentId } },
      }),
    ]);

    if (!exam) throw new NotFoundException('Exam not found');
    if (exam.status !== ResultStatus.APPROVED) {
      throw new BadRequestException(
        'This exam is not yet approved or available',
      );
    }

    if (existingAttempt) {
      if (existingAttempt.status === 'IN_PROGRESS') {
        return {
          attemptId: existingAttempt.id,
          startTime: existingAttempt.startTime,
          exam,
        };
      }
      throw new BadRequestException('You have already taken this exam');
    }

    const newAttempt = await this.prisma.examAttempt.create({
      data: { examId, studentId, status: 'IN_PROGRESS', startTime: new Date() },
    });

    return {
      attemptId: newAttempt.id,
      startTime: newAttempt.startTime,
      exam,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SUBMIT EXAM  →  auto-grade + update results + notify teacher (debounced)
  // ═══════════════════════════════════════════════════════════════════════════
  async submitExam(
    examId: string,
    studentId: string,
    answers: Record<string, string>,
  ) {
    const [attempt, student] = await Promise.all([
      this.prisma.examAttempt.findUnique({
        where: { examId_studentId: { examId, studentId } },
        include: {
          exam: {
            include: {
              questions: true,
              teacher: { select: { fullName: true, email: true } },
              school: { select: { name: true, shortName: true } },
              subject: { select: { name: true } },
              class: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.student.findUnique({
        where: { id: studentId },
        select: {
          classArmId: true,
          classId: true,
          schoolId: true,
          firstName: true,
          lastName: true,
        },
      }),
    ]);

    if (!attempt) throw new NotFoundException('Exam attempt not found');
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Exam has already been submitted');
    }
    if (!student) throw new NotFoundException('Student not found');

    // Auto-grade
    let totalScore = 0;
    const questions = attempt.exam.questions;
    questions.forEach((question: any) => {
      if (answers[question.id] === question.correctAnswer) {
        totalScore += question.marks;
      }
    });

    // Resolve session & term
    let sessionId: string | null = attempt.exam.sessionId;
    if (!sessionId) {
      const activeSession = await this.prisma.academicSession.findFirst({
        where: { schoolId: student.schoolId, isActive: true },
        select: { id: true },
      });
      sessionId = activeSession?.id || null;
    }

    let termId: string | null = null;
    if (sessionId) {
      const academicTerm = await this.prisma.academicTerm.findFirst({
        where: {
          sessionId,
          name: { equals: attempt.exam.term, mode: 'insensitive' },
        },
        select: { id: true },
      });
      termId = academicTerm?.id || null;
    }

    // Persist attempt + upsert result/score in one transaction
    const updatedAttempt = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.examAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'SUBMITTED',
          endTime: new Date(),
          answers: answers as any,
          score: totalScore,
        },
      });

      if (sessionId && termId && student.classArmId && student.classId) {
        const resultRecord = await tx.result.upsert({
          where: {
            schoolId_classId_classArmId_subjectId_sessionId_termId: {
              schoolId: student.schoolId,
              classId: student.classId,
              classArmId: student.classArmId,
              subjectId: attempt.exam.subjectId,
              sessionId,
              termId,
            },
          },
          update: {},
          create: {
            schoolId: student.schoolId,
            classId: student.classId,
            classArmId: student.classArmId,
            subjectId: attempt.exam.subjectId,
            sessionId,
            termId,
            teacherId: attempt.exam.teacherId,
            status: ResultStatus.PENDING,
          },
        });

        await tx.studentScore.upsert({
          where: {
            resultId_studentId: { resultId: resultRecord.id, studentId },
          },
          update: {
            totalScore,
            assessmentScores: { exam: totalScore },
          },
          create: {
            resultId: resultRecord.id,
            studentId,
            totalScore,
            assessmentScores: { exam: totalScore },
          },
        });
      }

      return updated;
    });

    const percentage = attempt.exam.totalMarks
      ? +((totalScore / attempt.exam.totalMarks) * 100).toFixed(2)
      : 0;

    const schoolName = attempt.exam.school?.name ?? '';

    // ── Fire-and-forget: debounced teacher notification ────────────────────
    if (attempt.exam.teacher?.email) {
      this.maybeNotifyTeacher(examId, attempt.exam).catch((err) =>
        this.logger.error(
          `Teacher notification failed for exam ${examId}: ${err.message}`,
        ),
      );
    }

    return {
      success: true,
      schoolName,
      message: `Exam submitted successfully. You scored ${totalScore} / ${attempt.exam.totalMarks} (${percentage}%).`,
      data: {
        attemptId: updatedAttempt.id,
        score: totalScore,
        totalMarks: attempt.exam.totalMarks,
        percentage,
        submittedAt: updatedAttempt.endTime,
        studentName: `${student.firstName} ${student.lastName}`,
      },
    };
  }

  /**
   * Debounced teacher notification.
   * Skips the email if one was already sent for this exam within NOTIFY_DEBOUNCE_MS.
   * This prevents a burst of emails when many students submit at the same time.
   */
  private async maybeNotifyTeacher(examId: string, examSnap: any) {
    const lastSent = this.lastNotifiedAt.get(examId) ?? 0;
    const now = Date.now();

    if (now - lastSent < this.NOTIFY_DEBOUNCE_MS) {
      this.logger.log(
        `Skipping teacher notification for exam ${examId} — last sent ${Math.round((now - lastSent) / 1000)}s ago (debounce: ${this.NOTIFY_DEBOUNCE_MS / 1000}s)`,
      );
      return;
    }

    // Record the send time immediately to prevent a second concurrent submission
    // from also deciding to send
    this.lastNotifiedAt.set(examId, now);
    await this.compileAndNotifyTeacher(examId, examSnap);
  }

  /** Internal: gather all SUBMITTED attempts and email the teacher. */
  private async compileAndNotifyTeacher(examId: string, examSnap: any) {
    const attempts = await this.prisma.examAttempt.findMany({
      where: { examId, status: 'SUBMITTED' },
      include: {
        student: {
          select: { firstName: true, lastName: true, registrationNumber: true },
        },
      },
      orderBy: { score: 'desc' },
    });

    if (!attempts.length) return;

    await this.mailService.sendExamClassResultsToTeacher({
      teacher: examSnap.teacher as { fullName: string; email: string },
      exam: {
        title: examSnap.title,
        totalMarks: examSnap.totalMarks,
        subject: examSnap.subject,
        class: examSnap.class,
        term: examSnap.term,
      },
      attempts: attempts.map((a) => ({
        studentName: `${a.student.firstName} ${a.student.lastName}`,
        registrationNumber: a.student.registrationNumber,
        score: a.score ?? 0,
        percentage: examSnap.totalMarks
          ? +(((a.score ?? 0) / examSnap.totalMarks) * 100).toFixed(2)
          : 0,
        submittedAt: a.endTime,
      })),
      school: examSnap.school as { name: string; shortName: string | null },
    });

    this.logger.log(
      `Exam results email sent to ${examSnap.teacher.email} for exam "${examSnap.title}" (${attempts.length} submissions)`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  EXAM CRUD
  // ═══════════════════════════════════════════════════════════════════════════
  async updateExam(examId: string, updates: any, user?: any) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Exam not found');

    if (user) {
      const isOwner = user.role === 'TEACHER' && exam.teacherId === user.sub;
      if (!isOwner && !this.isAdmin(user)) {
        throw new ForbiddenException(
          'You are not authorized to edit this exam',
        );
      }
    }

    return this.prisma.exam.update({ where: { id: examId }, data: updates });
  }

  /**
   * Delete an exam and ALL its question images from Cloudinary.
   * Cloudinary deletions happen in parallel (question images + option images)
   * to avoid sequential delays on exams with many questions.
   */
  async deleteExam(examId: string, user?: any) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { questions: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    if (user) {
      const isOwner = user.role === 'TEACHER' && exam.teacherId === user.sub;
      if (!isOwner && !this.isAdmin(user)) {
        throw new ForbiddenException(
          'You are not authorized to delete this exam',
        );
      }
    }

    if (exam.status === ResultStatus.APPROVED) {
      throw new BadRequestException('Approved exams cannot be deleted');
    }

    // Collect all Cloudinary public IDs to delete in parallel
    const publicIdsToDelete: string[] = [];
    for (const question of exam.questions) {
      if (question.imagePublicId)
        publicIdsToDelete.push(question.imagePublicId);
      if (question.options) {
        const options = question.options as any[];
        options.forEach((opt) => {
          if (opt.imagePublicId) publicIdsToDelete.push(opt.imagePublicId);
        });
      }
    }

    if (publicIdsToDelete.length > 0) {
      this.logger.log(
        `Deleting ${publicIdsToDelete.length} Cloudinary asset(s) for exam ${examId}`,
      );
      await Promise.allSettled(
        publicIdsToDelete.map((pid) =>
          this.cloudinary
            .deleteFile(pid)
            .catch((e) =>
              this.logger.error(
                `Failed to delete Cloudinary asset ${pid}: ${e.message}`,
              ),
            ),
        ),
      );
    }

    await this.prisma.exam.delete({ where: { id: examId } });
    return { success: true, message: 'Exam deleted successfully' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  READ QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * List all exams for a teacher — lightweight (no full question bodies).
   * Use GET /:id to retrieve full questions for a specific exam.
   */
  async getExamsByTeacher(teacherId: string) {
    return this.prisma.exam.findMany({
      where: { teacherId },
      include: {
        subject: { select: { name: true, code: true } },
        class: { select: { name: true } },
        school: { select: { name: true, shortName: true } },
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Get a single exam with full question details. */
  async getExamWithQuestions(examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: true,
        subject: { select: { name: true, code: true } },
        class: { select: { name: true } },
        school: { select: { name: true, shortName: true } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    return exam;
  }

  /**
   * List all exams for a school — lightweight (no full question bodies).
   * Admin/teacher list view; use GET /:id for full question details.
   */
  async getExamsBySchool(schoolId: string) {
    return this.prisma.exam.findMany({
      where: { schoolId },
      include: {
        subject: { select: { name: true, code: true } },
        class: { select: { name: true } },
        teacher: { select: { fullName: true } },
        school: { select: { name: true, shortName: true } },
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Approve or reject an exam.
   * Authorised roles: PRINCIPAL, ICT_ADMIN, SCHOOL_OWNER, DIRECTOR, SCHOOL_ADMIN, SUB_ADMIN,
   * or a form-teacher whose formTeacherClasses includes the exam's class.
   */
  async approveExam(examId: string, user: any, dto: ApproveExamDto) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Exam not found');

    let isAuthorized = this.isAdmin(user);

    // Form-teacher check (only relevant when not already admin)
    if (!isAuthorized && user.role === 'TEACHER') {
      const teacher = await this.prisma.teacher.findUnique({
        where: { id: user.sub },
        select: { formTeacherClasses: true },
      });
      if (teacher && teacher.formTeacherClasses.includes(exam.classId)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException(
        'You are not authorized to approve this exam',
      );
    }

    return this.prisma.exam.update({
      where: { id: examId },
      data: {
        status: dto.status,
        approvedById: user.sub,
        rejectionReason:
          dto.status === ResultStatus.REJECTED ? dto.rejectionReason : null,
      },
      include: {
        subject: { select: { name: true } },
        class: { select: { name: true } },
        school: { select: { name: true, shortName: true } },
        teacher: { select: { fullName: true } },
      },
    });
  }

  async getExamsByClassAndSubject(
    classId: string,
    subjectId: string,
    schoolId: string,
    term?: string,
    studentId?: string,
  ) {
    return this.prisma.exam.findMany({
      where: {
        classId,
        subjectId,
        schoolId,
        status: ResultStatus.APPROVED,
        ...(term && { term }),
      },
      include: {
        subject: { select: { name: true, code: true } },
        class: { select: { name: true } },
        teacher: { select: { fullName: true } },
        school: { select: { name: true, shortName: true } },
        _count: { select: { questions: true } },
      },
    });
  }
}
