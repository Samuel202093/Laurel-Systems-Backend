import { Injectable, InternalServerErrorException, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { ResultStatus } from '@prisma/client';
import { ApproveExamDto } from './dto/approve-exam.dto';

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async createExam(dto: CreateExamDto, files: Express.Multer.File[]) {
    try {
      const { questions, ...examData } = dto;

      // Verify school, teacher, subject, class exist
      const [school, teacher, subject, studentClass] = await Promise.all([
        this.prisma.school.findUnique({ where: { id: examData.schoolId } }),
        this.prisma.teacher.findUnique({ where: { id: examData.teacherId } }),
        this.prisma.subject.findUnique({ where: { id: examData.subjectId } }),
        this.prisma.class.findUnique({ where: { id: examData.classId } }),
      ]);

      if (!school) throw new NotFoundException(`School not found`);
      if (!teacher) throw new NotFoundException(`Teacher not found`);
      if (!subject) throw new NotFoundException(`Subject not found`);
      if (!studentClass) throw new NotFoundException(`Class not found`);

      // If sessionId is not provided, try to find active session
      if (!examData.sessionId) {
        const activeSession = await this.prisma.academicSession.findFirst({
          where: { schoolId: school.id, isActive: true },
          select: { id: true },
        });
        examData.sessionId = activeSession?.id;
      }

      const cloudinaryFolder = `schools/${school.id}/exams/${examData.title.replace(/\s+/g, '_')}`;

      // Handle image uploads
      // Match files to questions that have images
      let currentFileIndex = 0;
      const uploadTasks = questions.map((q) => {
        // q.hasImage is true if there's a file to upload or an external URL
        // If there's no imageUrl but hasImage is true, it means we expect a file
        if (!q.imageUrl && q.hasImage && files && files[currentFileIndex]) {
          const file = files[currentFileIndex++];
          return { q, file };
        }
        return { q, file: null };
      });

      const questionsWithImages = await Promise.all(
        uploadTasks.map(async ({ q, file }) => {
          if (file) {
            try {
              const uploadRes = await this.cloudinary.uploadFile(file, cloudinaryFolder);
              return {
                ...q,
                imageUrl: uploadRes.secure_url,
                imagePublicId: uploadRes.public_id,
              };
            } catch (error) {
              this.logger.error(`Failed to upload image for question: ${q.questionText}`, error);
              throw new InternalServerErrorException('Failed to upload question images');
            }
          }
          return q;
        }),
      );

      // Create Exam and Questions in a transaction
      return await this.prisma.$transaction(async (tx: any) => {
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

  async deleteQuestion(examId: string, questionId: string) {
    const question = await (this.prisma as any).question.findUnique({
      where: { id: questionId },
    });

    if (!question) throw new NotFoundException('Question not found');

    if (question.imagePublicId) {
      await this.cloudinary.deleteFile(question.imagePublicId);
    }

    return (this.prisma as any).question.delete({
      where: { id: questionId },
    });
  }

  async updateQuestion(examId: string, questionId: string, updates: any, file?: Express.Multer.File) {
    const question = await (this.prisma as any).question.findUnique({
      where: { id: questionId },
      include: { exam: true },
    });

    if (!question) throw new NotFoundException('Question not found');

    let { imageUrl, imagePublicId } = question;

    if (file) {
      // Delete old image if it exists
      if (imagePublicId) {
        await this.cloudinary.deleteFile(imagePublicId);
      }

      // Upload new image
      const folder = `schools/${question.exam.schoolId}/exams/${question.exam.title.replace(/\s+/g, '_')}`;
      const uploadRes = await this.cloudinary.uploadFile(file, folder);
      imageUrl = uploadRes.secure_url;
      imagePublicId = uploadRes.public_id;
    }

    return await (this.prisma as any).question.update({
      where: { id: questionId },
      data: {
        ...updates,
        imageUrl,
        imagePublicId,
      },
    });
  }

  async verifyExamKey(examId: string, examKey: string, schoolId: string, classId: string) {
    const exam = await (this.prisma as any).exam.findFirst({
      where: { 
        id: examId,
        schoolId,
        classId
      },
      select: { examKey: true },
    });

    if (!exam) throw new NotFoundException('Exam not found for this school and class');

    if (exam.examKey && exam.examKey !== examKey) {
      throw new ForbiddenException('Invalid exam key');
    }

    return { success: true, message: 'Exam key verified successfully' };
  }

  async startExam(examId: string, studentId: string) {
    // 1. Fetch exam metadata and check if student already has an attempt
    const [exam, existingAttempt] = await Promise.all([
      (this.prisma as any).exam.findUnique({
        where: { id: examId },
        select: {
          id: true,
          status: true,
          durationMinutes: true,
          title: true,
          instructions: true,
          totalQuestions: true,
          totalMarks: true,
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
      (this.prisma as any).examAttempt.findUnique({
        where: {
          examId_studentId: {
            examId,
            studentId,
          },
        },
      }),
    ]);

    if (!exam) throw new NotFoundException('Exam not found');
    if (exam.status !== ResultStatus.APPROVED) {
      throw new BadRequestException('This exam is not yet approved or available');
    }

    // 2. If attempt exists, return it if still in progress, otherwise error
    if (existingAttempt) {
      if (existingAttempt.status === 'IN_PROGRESS') {
        // Return existing attempt and exam data
        return {
          attemptId: existingAttempt.id,
          startTime: existingAttempt.startTime,
          exam: {
            ...exam,
            questions: exam.questions, // Already fetched
          },
        };
      }
      throw new BadRequestException('You have already taken this exam');
    }

    // 3. Create new attempt
    const newAttempt = await (this.prisma as any).examAttempt.create({
      data: {
        examId,
        studentId,
        status: 'IN_PROGRESS',
        startTime: new Date(),
      },
    });

    return {
      attemptId: newAttempt.id,
      startTime: newAttempt.startTime,
      exam: {
        ...exam,
        questions: exam.questions,
      },
    };
  }

  async submitExam(examId: string, studentId: string, answers: Record<string, string>) {
    // 1. Fetch attempt, student, and exam questions with correct answers
    const [attempt, student] = await Promise.all([
      (this.prisma as any).examAttempt.findUnique({
        where: {
          examId_studentId: {
            examId,
            studentId,
          },
        },
        include: {
          exam: {
            include: {
              questions: true,
            },
          },
        },
      }),
      this.prisma.student.findUnique({
        where: { id: studentId },
        select: { classArmId: true, classId: true, schoolId: true },
      }),
    ]);

    if (!attempt) throw new NotFoundException('Exam attempt not found');
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Exam has already been submitted');
    }
    if (!student) throw new NotFoundException('Student not found');

    // 2. Auto-grade the exam
    let totalScore = 0;
    const questions = attempt.exam.questions;

    questions.forEach((question: any) => {
      const studentAnswer = answers[question.id];
      if (studentAnswer === question.correctAnswer) {
        totalScore += question.marks;
      }
    });

    // 3. Find active session and term if not in exam
    let sessionId = attempt.exam.sessionId;
    if (!sessionId) {
      const activeSession = await this.prisma.academicSession.findFirst({
        where: { schoolId: student.schoolId, isActive: true },
        select: { id: true },
      });
      sessionId = activeSession?.id;
    }

    let termId: string | null = null;
    if (sessionId) {
      const academicTerm = await this.prisma.academicTerm.findFirst({
        where: {
          sessionId: sessionId,
          name: { equals: attempt.exam.term, mode: 'insensitive' },
        },
        select: { id: true },
      });
      termId = academicTerm?.id || null;
    }

    // 4. Update the attempt, result, and student score in a transaction for high performance and consistency
    return await this.prisma.$transaction(async (tx: any) => {
      // Update attempt
      const updatedAttempt = await tx.examAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'SUBMITTED',
          endTime: new Date(),
          answers: answers as any,
          score: totalScore,
        },
      });

      // If we have session and term info, link to the main results module for teacher approval
      if (sessionId && termId && student.classArmId) {
        // Find or create the Result record for this class/subject/session/term
        const resultRecord = await tx.result.upsert({
          where: {
            schoolId_classId_classArmId_subjectId_sessionId_termId: {
              schoolId: student.schoolId,
              classId: student.classId,
              classArmId: student.classArmId,
              subjectId: attempt.exam.subjectId,
              sessionId: sessionId,
              termId: termId,
            },
          },
          update: {},
          create: {
            schoolId: student.schoolId,
            classId: student.classId,
            classArmId: student.classArmId,
            subjectId: attempt.exam.subjectId,
            sessionId: sessionId,
            termId: termId,
            teacherId: attempt.exam.teacherId,
            status: ResultStatus.PENDING,
          },
        });

        // Upsert student score in the results module
        await tx.studentScore.upsert({
          where: {
            resultId_studentId: {
              resultId: resultRecord.id,
              studentId: studentId,
            },
          },
          update: {
            totalScore: totalScore,
            assessmentScores: {
              exam: totalScore,
              // We could potentially store more breakdown here if needed
            },
          },
          create: {
            resultId: resultRecord.id,
            studentId: studentId,
            totalScore: totalScore,
            assessmentScores: {
              exam: totalScore,
            },
          },
        });
      }

      return updatedAttempt;
    });
  }

  async updateExam(examId: string, updates: any) {
    const exam = await (this.prisma as any).exam.findUnique({
      where: { id: examId },
    });

    if (!exam) throw new NotFoundException('Exam not found');

    return (this.prisma as any).exam.update({
      where: { id: examId },
      data: updates,
    });
  }

  async getExamsByTeacher(teacherId: string) {
    return (this.prisma as any).exam.findMany({
      where: { teacherId },
      include: {
        subject: true,
        class: true,
        _count: {
          select: { questions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getExamWithQuestions(examId: string) {
    const exam = await (this.prisma as any).exam.findUnique({
      where: { id: examId },
      include: {
        questions: true,
        subject: true,
        class: true,
      },
    });

    if (!exam) throw new NotFoundException('Exam not found');
    return exam;
  }

  async getExamsBySchool(schoolId: string) {
    return (this.prisma as any).exam.findMany({
      where: { schoolId },
      include: {
        subject: true,
        class: true,
        teacher: {
          select: { fullName: true },
        },
        _count: {
          select: { questions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveExam(examId: string, user: any, dto: ApproveExamDto) {
    const exam = await (this.prisma as any).exam.findUnique({
      where: { id: examId },
    });

    if (!exam) throw new NotFoundException('Exam not found');

    // Role-based authorization
    const isPrincipal = user.role === 'SCHOOL_ADMIN' && user.subRole === 'PRINCIPAL';
    const isIctAdmin = user.role === 'SCHOOL_ADMIN' && user.subRole === 'ICT_ADMIN';
    const isSchoolOwner = user.role === 'SCHOOL_ADMIN' && user.subRole === 'SCHOOL_OWNER';
    const isDirector = user.role === 'SCHOOL_ADMIN' && user.subRole === 'DIRECTOR';
    
    // Check if user is a form teacher for this class
    let isFormTeacher = false;
    if (user.role === 'TEACHER') {
      const teacher = await (this.prisma as any).teacher.findUnique({
        where: { id: user.sub },
        select: { formTeacherClasses: true },
      });
      if (teacher && teacher.formTeacherClasses.includes(exam.classId)) {
        isFormTeacher = true;
      }
    }

    const isAuthorized = isPrincipal || isIctAdmin || isSchoolOwner || isDirector || isFormTeacher;

    if (!isAuthorized) {
      throw new ForbiddenException('You are not authorized to approve this exam');
    }

    return (this.prisma as any).exam.update({
      where: { id: examId },
      data: {
        status: dto.status,
        approvedById: user.sub,
        rejectionReason: dto.status === ResultStatus.REJECTED ? dto.rejectionReason : null,
      },
    });
  }

  async getExamsByClassAndSubject(classId: string, subjectId: string, schoolId: string, term?: string, studentId?: string) {
    return (this.prisma as any).exam.findMany({
      where: {
        classId,
        subjectId,
        schoolId,
        status: ResultStatus.APPROVED,
        ...(term && { term }),
      },
      include: {
        questions: true,
        subject: {
          select: { name: true, code: true },
        },
        class: {
          select: { name: true },
        },
        teacher: {
          select: { fullName: true },
        },
        attempts: studentId ? {
          where: { studentId },
          select: { status: true, score: true, startTime: true, endTime: true },
        } : false,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
