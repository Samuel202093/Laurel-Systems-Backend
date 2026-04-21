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
  //  - Each Result is unique per (school, class, classArm, subject, session, term)
  //  - If the same teacher re-uploads → update scores, reset to PENDING
  //  - If a DIFFERENT teacher tries to upload for the same combination:
  //      • If the existing result is APPROVED → reject (must be revoked first)
  //      • Otherwise → allow the new teacher to take ownership and update
  // ═══════════════════════════════════════════════════════════════════════
  async uploadResults(schoolId: string, teacherId: string, dto: UploadResultDto) {
    if (!teacherId) {
      throw new BadRequestException('Teacher ID is missing. Please log in again.');
    }

    const { classId, classArmId, subjectId: subjectNameOrId, sessionId, termName, scores } = dto;

    // 1. Resolve grading system (handles name resolution internally)
    const gradingSystem = await this.gradingService.getGradingSystem(schoolId, sessionId, termName);
    if (!gradingSystem) {
      throw new BadRequestException(
        `Grading system not set for session "${sessionId}" and term "${termName}". Please contact admin.`,
      );
    }

    // Validate the teacher exists — the logged-in user might be a SchoolAdmin (ICT_ADMIN, etc.)
    // who is not in the Teacher table. In that case, look them up via SchoolAdmin.
    let resolvedTeacherId = teacherId;
    const teacherExists = await (this.prisma as any).teacher.findFirst({
      where: { id: teacherId, schoolId },
      select: { id: true },
    });

    if (!teacherExists) {
      // Try to find a Teacher record by matching the SchoolAdmin's email
      const admin = await (this.prisma as any).schoolAdmin.findFirst({
        where: { id: teacherId, schoolId },
        select: { email: true },
      });

      if (admin) {
        const teacherByEmail = await (this.prisma as any).teacher.findFirst({
          where: { email: admin.email, schoolId },
          select: { id: true },
        });

        if (teacherByEmail) {
          resolvedTeacherId = teacherByEmail.id;
        } else {
          throw new BadRequestException(
            'Your admin account does not have a linked Teacher profile. ' +
            'Please ask an administrator to create a Teacher record for you, or log in with your Teacher account.',
          );
        }
      } else {
        throw new BadRequestException(
          'Could not find your Teacher profile. Please ensure you are logged in correctly.',
        );
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      // 2. Resolve names → UUIDs
      const session = await this.resolveSession(tx, schoolId, sessionId);
      const term = await this.resolveTerm(tx, session, termName);
      const subject = await this.resolveSubject(tx, schoolId, subjectNameOrId);
      const finalTermId = term?.id || null;

      // 3. Check for existing result (upsert logic)
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
        // ── Existing result found ──
        isUpdate = true;

        // If it was uploaded by a DIFFERENT teacher and already APPROVED, block the overwrite
        if (result.teacherId !== resolvedTeacherId && result.status === ResultStatus.APPROVED) {
          throw new ForbiddenException(
            'This result has already been uploaded and approved by another teacher. ' +
            'Contact admin to revoke approval before re-uploading.',
          );
        }

        // Update: reassign to current teacher, reset status to PENDING
        result = await (tx as any).result.update({
          where: { id: result.id },
          data: {
            teacherId: resolvedTeacherId,
            status: ResultStatus.PENDING,
            approvedById: null,
            rejectionReason: null,
          },
        });
      } else {
        // ── Create new result record ──
        result = await (tx as any).result.create({
          data: {
            schoolId,
            classId,
            classArmId,
            subjectId: subject.id,
            sessionId: session.id,
            termId: finalTermId,
            teacherId: resolvedTeacherId,
            status: ResultStatus.PENDING,
          },
        });
      }

      // Guard: ensure result was created/updated successfully
      if (!result || !result.id) {
        throw new InternalServerErrorException(
          'Failed to create or update the result record. Please try again.',
        );
      }

      // 4. Process individual student scores with grading
      const studentScoreData = scores.map((s) => {
        const totalScore = Object.values(s.assessmentScores).reduce(
          (acc, curr) => acc + curr,
          0,
        );

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

      // 5. Replace scores: delete old → insert new (idempotent)
      await (tx as any).studentScore.deleteMany({ where: { resultId: result.id } });
      await (tx as any).studentScore.createMany({ data: studentScoreData });

      // 6. Re-fetch result with relations for the response
      const fullResult = await (tx as any).result.findUnique({
        where: { id: result.id },
        include: {
          subject: { select: { name: true, code: true } },
          session: { select: { name: true } },
          term: { select: { name: true } },
          class: { select: { name: true } },
          classArm: { select: { name: true } },
          teacher: { select: { fullName: true } },
          _count: { select: { scores: true } },
        },
      });

      return {
        ...fullResult,
        isUpdate,
        studentsCount: studentScoreData.length,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  TEACHER: Get my uploaded results (with status tracking)
  // ═══════════════════════════════════════════════════════════════════════
  async getTeacherResults(schoolId: string, teacherId: string) {
    return await (this.prisma as any).result.findMany({
      where: { schoolId, teacherId },
      include: {
        class: { select: { name: true } },
        classArm: { select: { name: true } },
        subject: { select: { name: true, code: true } },
        session: { select: { name: true } },
        term: { select: { name: true } },
        _count: { select: { scores: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  ADMIN: Get pending results for approval
  // ═══════════════════════════════════════════════════════════════════════
  async getPendingResults(schoolId: string) {
    return await (this.prisma as any).result.findMany({
      where: { schoolId, status: ResultStatus.PENDING },
      include: {
        class: { select: { name: true } },
        classArm: { select: { name: true } },
        subject: { select: { name: true } },
        session: { select: { name: true } },
        term: { select: { name: true } },
        teacher: { select: { fullName: true } },
        scores: {
          include: {
            student: { select: { firstName: true, lastName: true, registrationNumber: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
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
        resultSheet[key] = {
          session: score.result.session,
          term: score.result.term,
          class: score.result.class,
          classArm: score.result.classArm,
          subjects: [],
        };
      }

      resultSheet[key].subjects.push({
        subject: score.result.subject,
        assessmentScores: score.assessmentScores,
        totalScore: score.totalScore,
        grade: score.grade,
        remark: score.remark,
      });
    }

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
