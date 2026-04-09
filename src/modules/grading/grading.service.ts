import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGradingSystemDto } from './dto/grading-system.dto';

@Injectable()
export class GradingService {
  constructor(private prisma: PrismaService) {}

  async getGradingSystem(schoolId: string, sessionId: string, termId?: string) {
    const gradingSystem = await (this.prisma as any).gradingSystem.findUnique({
      where: {
        schoolId_sessionId_termId: {
          schoolId,
          sessionId,
          termId: termId || null,
        },
      },
      include: {
        grades: true,
        assessments: true,
        promotionCriteria: true,
      },
    });

    return gradingSystem;
  }

  async updateGradingSystem(schoolId: string, dto: CreateGradingSystemDto) {
    const { sessionId, termId, ...data } = dto;
    const termIdValue = termId || null;

    // 1. Check if grading system exists for the specific version
    const gradingSystem = await (this.prisma as any).gradingSystem.findUnique({
      where: {
        schoolId_sessionId_termId: {
          schoolId,
          sessionId,
          termId: termIdValue,
        },
      },
    });

    if (!gradingSystem) {
      // Create new version
      return (this.prisma as any).gradingSystem.create({
        data: {
          schoolId,
          sessionId,
          termId: termIdValue,
          passMark: data.passMark,
          grades: {
            create: data.grades,
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

    // 2. Update existing version
    return this.prisma.$transaction(async (tx) => {
      // Delete old related records for this specific version
      await (tx as any).gradeLevel.deleteMany({ where: { gradingSystemId: gradingSystem.id } });
      await (tx as any).assessmentType.deleteMany({ where: { gradingSystemId: gradingSystem.id } });
      await (tx as any).promotionCriteria.deleteMany({ where: { gradingSystemId: gradingSystem.id } });

      // Update main and create new related
      return (tx as any).gradingSystem.update({
        where: { id: gradingSystem.id },
        data: {
          passMark: data.passMark,
          grades: {
            create: data.grades,
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
  }
}
