import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGradingSystemDto } from './dto/grading-system.dto';

@Injectable()
export class GradingService {
  constructor(private prisma: PrismaService) {}

  private async getOrCreateSession(schoolId: string, sessionName: string, tx: any) {
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

  private async getOrCreateTerm(sessionId: string, termName: string, session: any, tx: any) {
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

      const termIdValue = termId && termId.toLowerCase() !== 'session-wide' 
        ? (await (this.prisma as any).academicTerm.findFirst({
            where: {
              sessionId: session.id,
              OR: [{ id: termId }, { name: termId }],
            },
          }))?.id || null
        : null;

      return await (this.prisma as any).gradingSystem.findFirst({
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
    } catch (error) {
      throw new InternalServerErrorException('Error retrieving grading system');
    }
  }

  async updateGradingSystem(schoolId: string, dto: CreateGradingSystemDto) {
    const { sessionId: sessionName, termId: termName, ...data } = dto;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Resolve or Create Academic Session
        const session = await this.getOrCreateSession(schoolId, sessionName, tx);

        // 2. Resolve or Create Academic Term
        const term = await this.getOrCreateTerm(session.id, termName || '', session, tx);
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
          // Create new
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

        // 5. Update existing version
        // Delete old related records
        await tx.gradeLevel.deleteMany({ where: { gradingSystemId: gradingSystem.id } });
        await tx.assessmentType.deleteMany({ where: { gradingSystemId: gradingSystem.id } });
        await tx.promotionCriteria.deleteMany({ where: { gradingSystemId: gradingSystem.id } });

        // Update main and create new related
        return await tx.gradingSystem.update({
          where: { id: gradingSystem.id },
          data: {
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
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      console.error('Grading update error:', error);
      throw new InternalServerErrorException('An unexpected error occurred while updating the grading system');
    }
  }
}

