import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadResultDto } from './dto/upload-result.dto';
import { ApproveResultDto } from './dto/approve-result.dto';
import { GradingService } from '../grading/grading.service';
import { ResultStatus } from '../../common/constants/result-status.enum';

@Injectable()
export class ResultsService {
  constructor(
    private prisma: PrismaService,
    private gradingService: GradingService,
  ) {}

  // ─── Helper: Check if a string looks like a valid UUID ──────────────────
  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  // ─── Helper: Resolve (or create) session from name or UUID ───────────────
  private async resolveSession(tx: any, schoolId: string, sessionNameOrId: string) {
    // Try to find by ID or name first
    const orClause: any[] = [{ name: sessionNameOrId }];
    if (this.isUuid(sessionNameOrId)) orClause.unshift({ id: sessionNameOrId });

    let session = await tx.academicSession.findFirst({
      where: { schoolId, OR: orClause },
    });

    if (!session) {
      // Auto-create the session from its name (e.g. "2026-2027" or "2025/2026")
      const years = sessionNameOrId.split(/[\/\-]/);
      const startYear = parseInt(years[0]) || new Date().getFullYear();
      const endYear = parseInt(years[1]) || startYear + 1;

      session = await tx.academicSession.create({
        data: {
          schoolId,
          name: sessionNameOrId,
          startDate: new Date(`${startYear}-09-01`),
          endDate: new Date(`${endYear}-08-31`),
          isActive: true,
        },
      });
    }

    return session;
  }

  // ─── Helper: Resolve (or create) term from name or UUID ─────────────────
  private async resolveTerm(tx: any, session: any, termNameOrId?: string) {
    if (!termNameOrId || termNameOrId.toLowerCase() === 'session-wide') return null;

    // Try to find by ID or name first
    const orClause: any[] = [{ name: termNameOrId }];
    if (this.isUuid(termNameOrId)) orClause.unshift({ id: termNameOrId });

    let term = await tx.academicTerm.findFirst({
      where: { sessionId: session.id, OR: orClause },
    });

    if (!term) {
      // Auto-create the term with default dates derived from the session
      term = await tx.academicTerm.create({
        data: {
          sessionId: session.id,
          name: termNameOrId,
          startDate: session.startDate,
          endDate: session.endDate,
          isActive: true,
        },
      });
    }

    return term;
  }

  // ─── Helper: Resolve subject by name or UUID ────────────────────────────
  private async resolveSubject(tx: any, schoolId: string, subjectNameOrId: string) {
    const orClause: any[] = [{ name: subjectNameOrId }];
    if (this.isUuid(subjectNameOrId)) orClause.unshift({ id: subjectNameOrId });

    const subject = await tx.subject.findFirst({
      where: { schoolId, OR: orClause },
    });
    if (!subject) throw new NotFoundException(`Subject "${subjectNameOrId}" not found.`);
    return subject;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  UPLOAD / UPSERT RESULTS
  // ═══════════════════════════════════════════════════════════════════════
  async uploadResults(schoolId: string, teacherId: string, dto: UploadResultDto) {
    if (!teacherId) {
      throw new BadRequestException('Teacher ID is missing. Please log in again.');
    }

    const { classId, classArmId, subjectId: subjectNameOrId, sessionId, termName, scores } = dto;

    // 1. Resolve teacher and check permissions
    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, subjects: true, schoolId: true },
    });

    if (!teacher || teacher.schoolId !== schoolId) {
      throw new ForbiddenException('Teacher not found or does not belong to this school.');
    }

    // 2. Resolve subject and verify teacher is assigned to it
    const subject = await this.resolveSubject(this.prisma, schoolId, subjectNameOrId);
    
    // Check if teacher is assigned to this subject (either by ID or name)
    const isAssignedToSubject = teacher.subjects.some(
      (s: string) => s === subject.id || s === subject.name
    );

    if (!isAssignedToSubject) {
      throw new ForbiddenException(`You are not assigned to the subject "${subject.name}".`);
    }

    // 3. Resolve grading system
    const gradingSystem = await this.gradingService.getGradingSystem(schoolId, sessionId, termName);
    if (!gradingSystem) {
      throw new BadRequestException(
        `Grading system not set for session "${sessionId}" and term "${termName}".`,
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      const session = await this.resolveSession(tx, schoolId, sessionId);
      const term = await this.resolveTerm(tx, session, termName);
      const finalTermId = term?.id || null;

      // 4. Check for existing result
      let result = await (tx as any).result.findFirst({
        where: {
          schoolId,
          classId,
          classArmId,
          subjectId: subject.id,
          sessionId: session.id,
          termId: finalTermId,
        },
      });

      let isUpdate = false;

      if (result) {
        isUpdate = true;
        // Only the original teacher or an admin can re-upload
        if (result.teacherId !== teacherId && result.status === ResultStatus.APPROVED) {
          throw new ForbiddenException(
            'This result is approved. Contact admin to revoke approval before re-uploading.',
          );
        }

        result = await (tx as any).result.update({
          where: { id: result.id },
          data: {
            teacherId: teacherId,
            status: ResultStatus.PENDING,
            approvedById: null,
            rejectionReason: null,
          },
        });
      } else {
        result = await (tx as any).result.create({
          data: {
            schoolId,
            classId,
            classArmId,
            subjectId: subject.id,
            sessionId: session.id,
            termId: finalTermId,
            teacherId: teacherId,
            status: ResultStatus.PENDING,
          },
        });
      }

      // 5. Process individual student scores
      const studentScoreData = scores.map((s) => {
        const totalScore = Object.values(s.assessmentScores).reduce((acc, curr) => acc + curr, 0);
        const gradeLevel = gradingSystem.grades.find(
          (g) => totalScore >= g.minScore && totalScore <= g.maxScore,
        );

        return {
          resultId: result.id,
          studentId: s.studentId,
          assessmentScores: s.assessmentScores as any,
          totalScore,
          grade: gradeLevel?.name || 'F',
          remark: s.remark || gradeLevel?.remark || 'Poor',
        };
      });

      await (tx as any).studentScore.deleteMany({ where: { resultId: result.id } });
      await (tx as any).studentScore.createMany({ data: studentScoreData });

      return {
        id: result.id,
        isUpdate,
        status: result.status,
        studentsCount: studentScoreData.length,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  VIEW RESULTS (Unified endpoint with permissions)
  // ═══════════════════════════════════════════════════════════════════════
  async getResults(schoolId: string, userId: string, roles: string[], filters: any) {
    const { classId, classArmId, subjectId, sessionId, termName, status } = filters;

    // 1. Determine user type and permissions
    const adminRoles = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'SCHOOL-ADMIN', 'SCHOOL_OWNER', 'DIRECTOR', 'PRINCIPAL', 'ICT_ADMIN', 'SUB_ADMIN', 'ADMIN'];
    const isAdmin = roles.some(r => {
      if (typeof r !== 'string') return false;
      const normalized = r.toUpperCase().trim().replace(/[- ]/g, '_');
      return adminRoles.some(ar => ar.replace(/[- ]/g, '_') === normalized);
    });
    
    let teacher: any = null;
    if (!isAdmin) {
      teacher = await (this.prisma as any).teacher.findUnique({
        where: { id: userId },
        select: { id: true, formTeacherArms: true, subjects: true },
      });
    }

    // 2. Build Prisma Query
    const where: any = { schoolId };
    if (classId) where.classId = classId;
    if (classArmId) where.classArmId = classArmId;
    if (subjectId) where.subjectId = subjectId;
    if (status) where.status = status;

    if (sessionId) {
      const session = await (this.prisma as any).academicSession.findFirst({
        where: { schoolId, OR: [{ id: sessionId }, { name: sessionId }] },
      });
      if (session) {
        where.sessionId = session.id;
        if (termName) {
          const term = await (this.prisma as any).academicTerm.findFirst({
            where: { sessionId: session.id, OR: [{ id: termName }, { name: termName }] },
          });
          if (term) where.termId = term.id;
        }
      }
    }

    // 3. Apply Permission Filters
    if (!isAdmin && teacher) {
      const isFormTeacher = teacher.formTeacherArms.includes(classArmId);
      
      if (!isFormTeacher) {
        // If not a form teacher for this arm, can only see their own subjects
        where.teacherId = teacher.id;
      }
      // If form teacher, they can see all subjects for their arm (handled by classArmId filter)
    }

    return await (this.prisma as any).result.findMany({
      where,
      include: {
        class: { select: { name: true } },
        classArm: { select: { name: true } },
        subject: { select: { name: true, code: true } },
        session: { select: { name: true } },
        term: { select: { name: true } },
        teacher: { select: { fullName: true } },
        _count: { select: { scores: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  GET SINGLE RESULT DETAIL
  // ═══════════════════════════════════════════════════════════════════════
  async getResultDetail(schoolId: string, resultId: string, userId: string, roles: string[]) {
    const result = await (this.prisma as any).result.findUnique({
      where: { id: resultId },
      include: {
        class: { select: { name: true } },
        classArm: { select: { name: true } },
        subject: { select: { name: true, code: true } },
        session: { select: { name: true } },
        term: { select: { name: true } },
        teacher: { select: { fullName: true } },
        scores: {
          include: {
            student: { select: { firstName: true, lastName: true, registrationNumber: true } },
          },
          orderBy: { student: { lastName: 'asc' } },
        },
      },
    });

    if (!result || result.schoolId !== schoolId) {
      throw new NotFoundException('Result not found.');
    }

    // Permission Check
    const adminRoles = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'SCHOOL-ADMIN', 'SCHOOL_OWNER', 'DIRECTOR', 'PRINCIPAL', 'ICT_ADMIN', 'SUB_ADMIN', 'ADMIN'];
    const isAdmin = roles.some(r => {
      if (typeof r !== 'string') return false;
      const normalized = r.toUpperCase().trim().replace(/[- ]/g, '_');
      return adminRoles.some(ar => ar.replace(/[- ]/g, '_') === normalized);
    });

    if (!isAdmin) {
      const teacher = await (this.prisma as any).teacher.findUnique({
        where: { id: userId },
        select: { id: true, formTeacherArms: true },
      });

      const isOwner = result.teacherId === userId;
      const isFormTeacher = teacher?.formTeacherArms.includes(result.classArmId);

      if (!isOwner && !isFormTeacher) {
        throw new ForbiddenException('You do not have permission to view this result.');
      }
    }

    return result;
  }


  // ═══════════════════════════════════════════════════════════════════════
  //  ADMIN: Approve or reject a result
  // ═══════════════════════════════════════════════════════════════════════
  async approveResult(schoolId: string, resultId: string, approvedById: string, dto: ApproveResultDto) {
    const result = await (this.prisma as any).result.findFirst({
      where: { id: resultId, schoolId },
    });

    if (!result) throw new NotFoundException('Result record not found.');

    return await (this.prisma as any).result.update({
      where: { id: resultId },
      data: {
        status: dto.status,
        approvedById: dto.status === ResultStatus.APPROVED ? approvedById : null,
        rejectionReason: dto.status === ResultStatus.REJECTED ? dto.rejectionReason : null,
      },
      include: {
        subject: { select: { name: true } },
        class: { select: { name: true } },
        classArm: { select: { name: true } },
        teacher: { select: { fullName: true } },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  STUDENT / PARENT: Get approved results for a student
  //  Accepts session and term as names or UUIDs
  // ═══════════════════════════════════════════════════════════════════════
  async getStudentResults(
    schoolId: string,
    studentId: string,
    sessionNameOrId?: string,
    termNameOrId?: string,
  ) {
    // Verify the student exists and belongs to this school
    const student = await (this.prisma as any).student.findFirst({
      where: { id: studentId, schoolId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        registrationNumber: true,
        classId: true,
        classArmId: true,
        class: { select: { name: true } },
        classArm: { select: { name: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found in this school.');

    // Build the filter
    const resultFilter: any = {
      schoolId,
      status: ResultStatus.APPROVED,
    };

    // Resolve session name → ID if provided
    if (sessionNameOrId) {
      const session = await (this.prisma as any).academicSession.findFirst({
        where: { schoolId, OR: [{ id: sessionNameOrId }, { name: sessionNameOrId }] },
      });
      if (!session) throw new NotFoundException(`Session "${sessionNameOrId}" not found.`);
      resultFilter.sessionId = session.id;

      // Resolve term name → ID if provided
      if (termNameOrId && termNameOrId.toLowerCase() !== 'session-wide') {
        const term = await (this.prisma as any).academicTerm.findFirst({
          where: { sessionId: session.id, OR: [{ id: termNameOrId }, { name: termNameOrId }] },
        });
        if (!term) throw new NotFoundException(`Term "${termNameOrId}" not found.`);
        resultFilter.termId = term.id;
      }
    }

    // Fetch all approved scores for this student
    const scores = await (this.prisma as any).studentScore.findMany({
      where: {
        studentId,
        result: resultFilter,
      },
      include: {
        result: {
          include: {
            subject: { select: { name: true, code: true } },
            session: { select: { id: true, name: true } },
            term: { select: { id: true, name: true } },
            class: { select: { name: true } },
            classArm: { select: { name: true } },
          },
        },
      },
      orderBy: { result: { subject: { name: 'asc' } } },
    });

    // Group scores by session → term for a structured result sheet
    const resultSheet: Record<string, any> = {};
    for (const score of scores) {
      const sessionName = score.result.session.name;
      const termName = score.result.term?.name || 'Session-Wide';
      const key = `${sessionName}___${termName}`;

      if (!resultSheet[key]) {
        // Fetch grading system for this specific session/term for metadata
        const gradingSystem = await this.gradingService.getGradingSystem(
          schoolId,
          score.result.sessionId,
          score.result.termId || undefined,
        );

        resultSheet[key] = {
          session: score.result.session,
          term: score.result.term,
          class: score.result.class,
          classArm: score.result.classArm,
          gradingSystem: gradingSystem
            ? {
                passMark: gradingSystem.passMark,
                grades: gradingSystem.grades,
                assessments: gradingSystem.assessments,
              }
            : null,
          subjects: [],
          summary: {
            totalScore: 0,
            averageScore: 0,
            subjectsCount: 0,
            passedCount: 0,
            failedCount: 0,
          },
        };
      }

      const currentGradingSystem = resultSheet[key].gradingSystem;
      const isPass = currentGradingSystem?.passMark
        ? score.totalScore >= currentGradingSystem.passMark
        : true;

      resultSheet[key].subjects.push({
        subject: score.result.subject,
        assessmentScores: score.assessmentScores,
        totalScore: score.totalScore,
        grade: score.grade,
        remark: score.remark,
        isPass,
      });

      // Update summary
      resultSheet[key].summary.totalScore += score.totalScore;
      resultSheet[key].summary.subjectsCount += 1;
      if (isPass) resultSheet[key].summary.passedCount += 1;
      else resultSheet[key].summary.failedCount += 1;
    }

    // Finalize summaries
    Object.values(resultSheet).forEach((sheet: any) => {
      if (sheet.summary.subjectsCount > 0) {
        sheet.summary.averageScore = parseFloat(
          (sheet.summary.totalScore / sheet.summary.subjectsCount).toFixed(2),
        );
      }
    });

    return {
      student,
      results: Object.values(resultSheet),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PARENT: Look up child's results by registration number
  //  Parents may not know the internal student UUID
  // ═══════════════════════════════════════════════════════════════════════
  async getStudentResultsByRegNo(
    schoolId: string,
    registrationNumber: string,
    sessionNameOrId?: string,
    termNameOrId?: string,
  ) {
    const student = await (this.prisma as any).student.findFirst({
      where: { schoolId, registrationNumber },
    });
    if (!student) {
      throw new NotFoundException(`Student with registration number "${registrationNumber}" not found.`);
    }

    return this.getStudentResults(schoolId, student.id, sessionNameOrId, termNameOrId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Get approved results for a class arm (all subjects combined)
  //  Accepts session and term as names or UUIDs
  // ═══════════════════════════════════════════════════════════════════════
  async getClassResults(
    schoolId: string,
    classId: string,
    classArmId: string,
    sessionNameOrId: string,
    termNameOrId?: string,
  ) {
    // Resolve session
    const session = await (this.prisma as any).academicSession.findFirst({
      where: { schoolId, OR: [{ id: sessionNameOrId }, { name: sessionNameOrId }] },
    });
    if (!session) throw new NotFoundException(`Session "${sessionNameOrId}" not found.`);

    // Resolve term
    let termId: string | null = null;
    if (termNameOrId && termNameOrId.toLowerCase() !== 'session-wide') {
      const term = await (this.prisma as any).academicTerm.findFirst({
        where: { sessionId: session.id, OR: [{ id: termNameOrId }, { name: termNameOrId }] },
      });
      if (!term) throw new NotFoundException(`Term "${termNameOrId}" not found.`);
      termId = term.id;
    }

    return await (this.prisma as any).result.findMany({
      where: {
        schoolId,
        classId,
        classArmId,
        sessionId: session.id,
        termId,
        status: ResultStatus.APPROVED,
      },
      include: {
        subject: { select: { name: true, code: true } },
        teacher: { select: { fullName: true } },
        scores: {
          include: {
            student: {
              select: { firstName: true, lastName: true, registrationNumber: true },
            },
          },
          orderBy: { totalScore: 'desc' },
        },
      },
      orderBy: { subject: { name: 'asc' } },
    });
  }
}
