import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGradingSystemDto } from './dto/grading-system.dto';

@Injectable()
export class GradingService {
  constructor(private prisma: PrismaService) {}

  private async getOrCreateSession(
    schoolId: string,
    sessionName: string,
    tx: any,
  ) {
    let session = await tx.academicSession.findUnique({
      where: {
        schoolId_name: {
          schoolId,
          name: sessionName,
        },
      },
    });

    if (!session) {
      // Parse dates from name (e.g. "2023/2024" or "2023-2024")
      const years = sessionName.split(/[\/\-]/);
      const startYear = parseInt(years[0]) || new Date().getFullYear();
      const endYear = parseInt(years[1]) || startYear + 1;

      session = await tx.academicSession.create({
        data: {
          schoolId,
          name: sessionName,
          startDate: new Date(`${startYear}-09-01`),
          endDate: new Date(`${endYear}-08-31`),
          isActive: true,
        },
      });
    }
    return session;
  }

  private async getOrCreateTerm(
    sessionId: string,
    termName: string,
    session: any,
    tx: any,
  ) {
    if (!termName || termName.toLowerCase() === 'session-wide') {
      return null;
    }

    let term = await tx.academicTerm.findUnique({
      where: {
        sessionId_name: {
          sessionId,
          name: termName,
        },
      },
    });

    if (!term) {
      // Create term with default dates based on session
      term = await tx.academicTerm.create({
        data: {
          sessionId,
          name: termName,
          startDate: session.startDate,
          endDate: session.endDate,
          isActive: true,
        },
      });
    }
    return term;
  }

  async getGradingSystem(schoolId: string, sessionId: string, termId?: string) {
    try {
      // Handle session and term name resolution if they are not UUIDs
      const session = await (this.prisma as any).academicSession.findFirst({
        where: {
          schoolId,
          OR: [{ id: sessionId }, { name: sessionId }],
        },
      });

      if (!session) return null;

      const termIdValue =
        termId && termId.toLowerCase() !== 'session-wide'
          ? (
              await (this.prisma as any).academicTerm.findFirst({
                where: {
                  sessionId: session.id,
                  OR: [{ id: termId }, { name: termId }],
                },
              })
            )?.id || null
          : null;

      const gradingSystem = await (this.prisma as any).gradingSystem.findFirst({
        where: {
          schoolId,
          sessionId: session.id,
          termId: termIdValue,
        },
        include: {
          grades: true,
          assessments: true,
          promotionCriteria: true,
        },
      });

      // If no term-specific grading system is found, fallback to session-wide (termId: null)
      if (!gradingSystem && termIdValue !== null) {
        return await (this.prisma as any).gradingSystem.findFirst({
          where: {
            schoolId,
            sessionId: session.id,
            termId: null,
          },
          include: {
            grades: true,
            assessments: true,
            promotionCriteria: true,
          },
        });
      }

      return gradingSystem;
    } catch (error) {
      throw new InternalServerErrorException('Error retrieving grading system');
    }
  }

  async updateGradingSystem(schoolId: string, dto: CreateGradingSystemDto) {
    const { sessionId: sessionName, termId: termName, ...data } = dto;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // 1. Resolve or Create Academic Session
          const session = await this.getOrCreateSession(
            schoolId,
            sessionName,
            tx,
          );

          // 2. Resolve or Create Academic Term
          const term = await this.getOrCreateTerm(
            session.id,
            termName || '',
            session,
            tx,
          );
          const termIdValue = term?.id || null;

          // 3. Map grades to handle "grade" property from frontend
          const mappedGrades = data.grades.map((g) => ({
            name: g.name || g.grade || '',
            abbreviation: g.abbreviation || g.grade || '',
            minScore: g.minScore,
            maxScore: g.maxScore,
            point: g.point,
            remark: g.remark,
          }));

          // 4. Check if grading system exists
          const gradingSystem = await tx.gradingSystem.findFirst({
            where: {
              schoolId,
              sessionId: session.id,
              termId: termIdValue,
            },
          });

          if (!gradingSystem) {
            // Create new grading system with all related records
            return await tx.gradingSystem.create({
              data: {
                schoolId,
                sessionId: session.id,
                termId: termIdValue,
                passMark: data.passMark,
                grades: {
                  create: mappedGrades,
                },
                assessments: {
                  create: data.assessments,
                },
                promotionCriteria: {
                  create: data.promotionCriteria,
                },
              },
              include: {
                grades: true,
                assessments: true,
                promotionCriteria: true,
              },
            });
          }

          // 5. Update existing grading system
          // grades and assessments are one-to-many: safe to use nested deleteMany + create
          await tx.gradingSystem.update({
            where: { id: gradingSystem.id },
            data: {
              passMark: data.passMark,
              grades: {
                deleteMany: {},
                create: mappedGrades,
              },
              assessments: {
                deleteMany: {},
                create: data.assessments,
              },
            },
          });

          // 6. promotionCriteria is one-to-one (@unique on gradingSystemId),
          //    so we upsert it separately to avoid relation constraint errors
          await tx.promotionCriteria.upsert({
            where: { gradingSystemId: gradingSystem.id },
            update: {
              minAverageScore: data.promotionCriteria.minAverageScore,
              minSubjectsPassed: data.promotionCriteria.minSubjectsPassed,
              mandatorySubjects: data.promotionCriteria.mandatorySubjects,
              useCumulativeAverage: data.promotionCriteria.useCumulativeAverage,
            },
            create: {
              gradingSystemId: gradingSystem.id,
              minAverageScore: data.promotionCriteria.minAverageScore,
              minSubjectsPassed: data.promotionCriteria.minSubjectsPassed,
              mandatorySubjects: data.promotionCriteria.mandatorySubjects,
              useCumulativeAverage: data.promotionCriteria.useCumulativeAverage,
            },
          });

          // 7. Return the fully updated grading system
          return await tx.gradingSystem.findUnique({
            where: { id: gradingSystem.id },
            include: {
              grades: true,
              assessments: true,
              promotionCriteria: true,
            },
          });
        },
        {
          timeout: 30000, // 30s transaction timeout
        },
      );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      console.error('Grading update error:', error);
      throw new InternalServerErrorException(
        'An unexpected error occurred while updating the grading system',
      );
    }
  }
}
