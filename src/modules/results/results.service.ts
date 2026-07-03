import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadResultDto } from './dto/upload-result.dto';
import { ApproveResultDto } from './dto/approve-result.dto';
import { GradingService } from '../grading/grading.service';
import { ResultStatus } from '../../common/constants/result-status.enum';

// ─── School identity shape returned on every result response ─────────────────
interface SchoolInfo {
  id: string;
  name: string;
  shortName: string | null;
  address: string;
  state: string;
  country: string;
  website: string | null;
}

@Injectable()
export class ResultsService {
  constructor(
    private prisma: PrismaService,
    private gradingService: GradingService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  /** Fetch the school's public profile for embedding in result responses. */
  private async fetchSchoolInfo(schoolId: string): Promise<SchoolInfo> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        shortName: true,
        address: true,
        state: true,
        country: true,
        website: true,
      },
    });
    if (!school) throw new NotFoundException('School not found.');
    return school;
  }

  /** Resolve (or auto-create) an academic session by name or UUID. */
  private async resolveSession(
    tx: any,
    schoolId: string,
    sessionNameOrId: string,
  ) {
    const orClause: any[] = [{ name: sessionNameOrId }];
    if (this.isUuid(sessionNameOrId)) orClause.unshift({ id: sessionNameOrId });

    let session = await tx.academicSession.findFirst({
      where: { schoolId, OR: orClause },
    });

    if (!session) {
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

  /** Resolve (or auto-create) an academic term by name or UUID. */
  private async resolveTerm(tx: any, session: any, termNameOrId?: string) {
    if (!termNameOrId || termNameOrId.toLowerCase() === 'session-wide')
      return null;

    const orClause: any[] = [{ name: termNameOrId }];
    if (this.isUuid(termNameOrId)) orClause.unshift({ id: termNameOrId });

    let term = await tx.academicTerm.findFirst({
      where: { sessionId: session.id, OR: orClause },
    });

    if (!term) {
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

  /** Resolve a subject by name or UUID. */
  private async resolveSubject(
    tx: any,
    schoolId: string,
    subjectNameOrId: string,
  ) {
    const orClause: any[] = [{ name: subjectNameOrId }];
    if (this.isUuid(subjectNameOrId)) orClause.unshift({ id: subjectNameOrId });

    const subject = await tx.subject.findFirst({
      where: { schoolId, OR: orClause },
    });
    if (!subject)
      throw new NotFoundException(`Subject "${subjectNameOrId}" not found.`);
    return subject;
  }

  private readonly ADMIN_ROLES = [
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'SCHOOL-ADMIN',
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'SUB_ADMIN',
    'ADMIN',
  ];

  private isAdmin(roles: string[]): boolean {
    return roles.some((r) => {
      if (typeof r !== 'string') return false;
      const n = r.toUpperCase().trim().replace(/[-\s]/g, '_');
      return this.ADMIN_ROLES.some((a) => a.replace(/[-\s]/g, '_') === n);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  UPLOAD / UPSERT RESULTS
  // ═══════════════════════════════════════════════════════════════════════════
  async uploadResults(
    schoolId: string,
    teacherId: string,
    dto: UploadResultDto,
  ) {
    if (!teacherId) {
      throw new BadRequestException(
        'Teacher ID is missing. Please log in again.',
      );
    }

    const {
      classId,
      classArmId,
      subjectId: subjectNameOrId,
      sessionId,
      termName,
      scores,
    } = dto;

    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, subjects: true, schoolId: true },
    });

    if (!teacher || teacher.schoolId !== schoolId) {
      throw new ForbiddenException(
        'Teacher not found or does not belong to this school.',
      );
    }

    const subject = await this.resolveSubject(
      this.prisma,
      schoolId,
      subjectNameOrId,
    );

    const isAssignedToSubject = teacher.subjects.some(
      (s: string) => s === subject.id || s === subject.name,
    );
    if (!isAssignedToSubject) {
      throw new ForbiddenException(
        `You are not assigned to the subject "${subject.name}".`,
      );
    }

    const gradingSystem = await this.gradingService.getGradingSystem(
      schoolId,
      sessionId,
      termName,
    );
    if (!gradingSystem) {
      throw new BadRequestException(
        `Grading system not set for session "${sessionId}" and term "${termName}".`,
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      const session = await this.resolveSession(tx, schoolId, sessionId);
      const term = await this.resolveTerm(tx, session, termName);
      const finalTermId = term?.id || null;

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
        if (
          result.teacherId !== teacherId &&
          result.status === ResultStatus.APPROVED
        ) {
          throw new ForbiddenException(
            'This result is approved. Contact admin to revoke approval before re-uploading.',
          );
        }
        result = await (tx as any).result.update({
          where: { id: result.id },
          data: {
            teacherId,
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
            teacherId,
            status: ResultStatus.PENDING,
          },
        });
      }

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

      await (tx as any).studentScore.deleteMany({
        where: { resultId: result.id },
      });
      await (tx as any).studentScore.createMany({ data: studentScoreData });

      // Fetch school info to surface schoolName at response top level
      const schoolInfo = await this.fetchSchoolInfo(schoolId);

      return {
        id: result.id,
        isUpdate,
        status: result.status,
        studentsCount: studentScoreData.length,
        schoolInfo,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  VIEW RESULTS (unified list — admin / teacher)
  // ═══════════════════════════════════════════════════════════════════════════
  async getResults(
    schoolId: string,
    userId: string,
    roles: string[],
    filters: any,
  ) {
    const { classId, classArmId, subjectId, sessionId, termName, status } =
      filters;

    // Fetch school info directly — no need for an array wrapper
    const schoolInfo = await this.fetchSchoolInfo(schoolId);

    const adminCheck = this.isAdmin(roles);
    let teacher: any = null;
    if (!adminCheck) {
      teacher = await (this.prisma as any).teacher.findUnique({
        where: { id: userId },
        select: { id: true, formTeacherArms: true, subjects: true },
      });
    }

    const where: any = { schoolId };
    if (classId) where.classId = classId;
    if (classArmId) where.classArmId = classArmId;
    if (subjectId) where.subjectId = subjectId;
    if (status) where.status = status;

    // Resolve session & term in a single branch — avoid sequential awaits
    if (sessionId) {
      const session = await (this.prisma as any).academicSession.findFirst({
        where: { schoolId, OR: [{ id: sessionId }, { name: sessionId }] },
      });
      if (session) {
        where.sessionId = session.id;
        if (termName) {
          const term = await (this.prisma as any).academicTerm.findFirst({
            where: {
              sessionId: session.id,
              OR: [{ id: termName }, { name: termName }],
            },
          });
          if (term) where.termId = term.id;
        }
      }
    }

    if (!adminCheck && teacher) {
      const isFormTeacher = teacher.formTeacherArms.includes(classArmId);
      if (!isFormTeacher) where.teacherId = teacher.id;
    }

    const results = await (this.prisma as any).result.findMany({
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

    return { schoolInfo, results };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GET SINGLE RESULT DETAIL
  // ═══════════════════════════════════════════════════════════════════════════
  async getResultDetail(
    schoolId: string,
    resultId: string,
    userId: string,
    roles: string[],
  ) {
    const [schoolInfo, result] = await Promise.all([
      this.fetchSchoolInfo(schoolId),
      (this.prisma as any).result.findUnique({
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
              student: {
                select: {
                  firstName: true,
                  lastName: true,
                  registrationNumber: true,
                },
              },
            },
            orderBy: { student: { lastName: 'asc' } },
          },
        },
      }),
    ]);

    if (!result || result.schoolId !== schoolId) {
      throw new NotFoundException('Result not found.');
    }

    if (!this.isAdmin(roles)) {
      const teacher = await (this.prisma as any).teacher.findUnique({
        where: { id: userId },
        select: { id: true, formTeacherArms: true },
      });
      const isOwner = result.teacherId === userId;
      const isFormTeacher = teacher?.formTeacherArms.includes(
        result.classArmId,
      );
      if (!isOwner && !isFormTeacher) {
        throw new ForbiddenException(
          'You do not have permission to view this result.',
        );
      }
    }

    return { schoolInfo, result };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ADMIN: Approve or reject a result
  // ═══════════════════════════════════════════════════════════════════════════
  async approveResult(
    schoolId: string,
    resultId: string,
    approvedById: string,
    dto: ApproveResultDto,
  ) {
    const result = await (this.prisma as any).result.findFirst({
      where: { id: resultId, schoolId },
    });
    if (!result) throw new NotFoundException('Result record not found.');

    const [schoolInfo, updated] = await Promise.all([
      this.fetchSchoolInfo(schoolId),
      (this.prisma as any).result.update({
        where: { id: resultId },
        data: {
          status: dto.status,
          approvedById:
            dto.status === ResultStatus.APPROVED ? approvedById : null,
          rejectionReason:
            dto.status === ResultStatus.REJECTED ? dto.rejectionReason : null,
        },
        include: {
          subject: { select: { name: true } },
          class: { select: { name: true } },
          classArm: { select: { name: true } },
          teacher: { select: { fullName: true } },
        },
      }),
    ]);

    return { schoolInfo, result: updated };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  STUDENT / PARENT: Approved result sheet for a student
  // ═══════════════════════════════════════════════════════════════════════════
  async getStudentResults(
    schoolId: string,
    studentId: string,
    sessionNameOrId?: string,
    termNameOrId?: string,
  ) {
    const [schoolInfo, student] = await Promise.all([
      this.fetchSchoolInfo(schoolId),
      (this.prisma as any).student.findFirst({
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
      }),
    ]);

    if (!student)
      throw new NotFoundException('Student not found in this school.');

    const resultFilter: any = { schoolId, status: ResultStatus.APPROVED };

    if (sessionNameOrId) {
      const session = await (this.prisma as any).academicSession.findFirst({
        where: {
          schoolId,
          OR: [{ id: sessionNameOrId }, { name: sessionNameOrId }],
        },
      });
      if (!session)
        throw new NotFoundException(`Session "${sessionNameOrId}" not found.`);
      resultFilter.sessionId = session.id;

      if (termNameOrId && termNameOrId.toLowerCase() !== 'session-wide') {
        const term = await (this.prisma as any).academicTerm.findFirst({
          where: {
            sessionId: session.id,
            OR: [{ id: termNameOrId }, { name: termNameOrId }],
          },
        });
        if (!term)
          throw new NotFoundException(`Term "${termNameOrId}" not found.`);
        resultFilter.termId = term.id;
      }
    }

    const scores = await (this.prisma as any).studentScore.findMany({
      where: { studentId, result: resultFilter },
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

    // Group by session → term
    const resultSheet: Record<string, any> = {};
    for (const score of scores) {
      const sessionName = score.result.session.name;
      const termName = score.result.term?.name || 'Session-Wide';
      const key = `${sessionName}___${termName}`;

      if (!resultSheet[key]) {
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

      const gs = resultSheet[key].gradingSystem;
      const isPass = gs?.passMark ? score.totalScore >= gs.passMark : true;

      resultSheet[key].subjects.push({
        subject: score.result.subject,
        assessmentScores: score.assessmentScores,
        totalScore: score.totalScore,
        grade: score.grade,
        remark: score.remark,
        isPass,
      });

      resultSheet[key].summary.totalScore += score.totalScore;
      resultSheet[key].summary.subjectsCount += 1;
      if (isPass) resultSheet[key].summary.passedCount += 1;
      else resultSheet[key].summary.failedCount += 1;
    }

    // Finalise averages
    Object.values(resultSheet).forEach((sheet: any) => {
      if (sheet.summary.subjectsCount > 0) {
        sheet.summary.averageScore = parseFloat(
          (sheet.summary.totalScore / sheet.summary.subjectsCount).toFixed(2),
        );
      }
    });

    return {
      schoolInfo,
      student,
      results: Object.values(resultSheet),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PARENT: Look up child's results by registration number
  // ═══════════════════════════════════════════════════════════════════════════
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
      throw new NotFoundException(
        `Student with registration number "${registrationNumber}" not found.`,
      );
    }
    return this.getStudentResults(
      schoolId,
      student.id,
      sessionNameOrId,
      termNameOrId,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CLASS RESULTS — all subjects + per-student aggregation & ranking
  // ═══════════════════════════════════════════════════════════════════════════
  async getClassResults(
    schoolId: string,
    classId: string,
    classArmId: string,
    sessionNameOrId: string,
    termNameOrId?: string,
  ) {
    const schoolInfo = await this.fetchSchoolInfo(schoolId);

    // Resolve session
    const session = await (this.prisma as any).academicSession.findFirst({
      where: {
        schoolId,
        OR: [{ id: sessionNameOrId }, { name: sessionNameOrId }],
      },
    });
    if (!session)
      throw new NotFoundException(`Session "${sessionNameOrId}" not found.`);

    // Resolve term
    let termId: string | null = null;
    let termRecord: any = null;
    if (termNameOrId && termNameOrId.toLowerCase() !== 'session-wide') {
      termRecord = await (this.prisma as any).academicTerm.findFirst({
        where: {
          sessionId: session.id,
          OR: [{ id: termNameOrId }, { name: termNameOrId }],
        },
      });
      if (!termRecord)
        throw new NotFoundException(`Term "${termNameOrId}" not found.`);
      termId = termRecord.id;
    }

    // Fetch grading system and raw results in parallel
    const [gradingSystem, rawResults] = await Promise.all([
      this.gradingService.getGradingSystem(
        schoolId,
        session.id,
        termId || undefined,
      ),
      (this.prisma as any).result.findMany({
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
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  registrationNumber: true,
                },
              },
            },
          },
        },
        orderBy: { subject: { name: 'asc' } },
      }),
    ]);

    // Build subject list (one entry per result/subject)
    const subjects = rawResults.map((r: any) => ({
      resultId: r.id,
      subject: r.subject,
      teacher: r.teacher,
      studentsCount: r.scores.length,
    }));

    // ── Per-student aggregate ──────────────────────────────────────────────
    const studentMap: Record<
      string,
      {
        studentId: string;
        fullName: string;
        registrationNumber: string;
        subjectScores: Array<{
          subject: { name: string; code: string | null };
          totalScore: number;
          grade: string | null;
          remark: string | null;
        }>;
        totalScore: number;
        subjectCount: number;
        passedSubjects: number;
        failedSubjects: number;
      }
    > = {};

    const passMark = gradingSystem?.passMark ?? 40;

    for (const result of rawResults) {
      for (const score of result.scores) {
        const sid = score.student.id;
        if (!studentMap[sid]) {
          studentMap[sid] = {
            studentId: sid,
            fullName: `${score.student.firstName} ${score.student.lastName}`,
            registrationNumber: score.student.registrationNumber,
            subjectScores: [],
            totalScore: 0,
            subjectCount: 0,
            passedSubjects: 0,
            failedSubjects: 0,
          };
        }
        const isPass = score.totalScore >= passMark;
        studentMap[sid].subjectScores.push({
          subject: result.subject,
          totalScore: score.totalScore,
          grade: score.grade,
          remark: score.remark,
        });
        studentMap[sid].totalScore += score.totalScore;
        studentMap[sid].subjectCount += 1;
        if (isPass) studentMap[sid].passedSubjects += 1;
        else studentMap[sid].failedSubjects += 1;
      }
    }

    // Compute averages, sort descending by totalScore, assign overall rank
    const students = Object.values(studentMap)
      .map((s) => ({
        ...s,
        averageScore:
          s.subjectCount > 0
            ? parseFloat((s.totalScore / s.subjectCount).toFixed(2))
            : 0,
      }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((s, idx) => ({ ...s, overallRank: idx + 1 }));

    return {
      schoolInfo,
      session: { id: session.id, name: session.name },
      term: termRecord ? { id: termRecord.id, name: termRecord.name } : null,
      class: rawResults[0]?.class ?? null,
      classArm: rawResults[0]?.classArm ?? null,
      gradingSystem: gradingSystem
        ? {
            passMark: gradingSystem.passMark,
            grades: gradingSystem.grades,
            assessments: gradingSystem.assessments,
          }
        : null,
      subjects,
      students,
      summary: {
        totalStudents: students.length,
        totalSubjects: subjects.length,
      },
    };
  }
}
