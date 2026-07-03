import {
  Injectable,
  NotFoundException,
  ConflictException,
  PreconditionFailedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassSetupDto } from './dto/class-setup.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateClassDto) {
    const { name, schoolId, arms } = dto;

    // 1. Verify class setup exists for the school
    const classSetup = await (this.prisma as any).classSetup.findUnique({
      where: { schoolId },
    });

    if (!classSetup) {
      throw new PreconditionFailedException(
        'Class setup structure not found for this school. Please complete the school structure setup first before creating individual classes.',
      );
    }

    // 2. Check if class name already exists for this school
    const existingClass = await (this.prisma as any).class.findUnique({
      where: {
        schoolId_name: { schoolId, name },
      },
    });
    if (existingClass) {
      throw new ConflictException(
        `Class "${name}" already exists for this school`,
      );
    }

    // 3. Create class and its arms in a transaction
    return (this.prisma as any).$transaction(async (tx: any) => {
      const newClass = await tx.class.create({
        data: {
          name,
          schoolId,
        },
      });

      if (arms && arms.length > 0) {
        await tx.classArm.createMany({
          data: arms.map((armName) => ({
            name: armName,
            classId: newClass.id,
          })),
        });
      }

      return tx.class.findUnique({
        where: { id: newClass.id },
        include: {
          arms: {
            include: {
              formTeacher: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  staffId: true,
                },
              },
            },
          },
        },
      });
    });
  }

  async findAll(schoolId: string) {
    // 1. Verify class setup exists for the school
    const classSetup = await (this.prisma as any).classSetup.findUnique({
      where: { schoolId },
    });

    if (!classSetup) {
      throw new PreconditionFailedException(
        'Class setup structure not found for this school. Please complete the school structure setup first.',
      );
    }

    // 2. Fetch all classes with their arms and assigned form teachers
    return (this.prisma as any).class.findMany({
      where: { schoolId },
      include: {
        arms: {
          include: {
            formTeacher: {
              select: {
                id: true,
                fullName: true,
                email: true,
                staffId: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    // 1. Fetch class details first to get the schoolId
    const classRecord = await (this.prisma as any).class.findUnique({
      where: { id },
      include: {
        arms: {
          include: {
            formTeacher: {
              select: {
                id: true,
                fullName: true,
                email: true,
                staffId: true,
              },
            },
          },
        },
      },
    });

    if (!classRecord) {
      throw new NotFoundException(`Class with ID ${id} not found`);
    }

    // 2. Verify class setup exists for the school
    const classSetup = await (this.prisma as any).classSetup.findUnique({
      where: { schoolId: classRecord.schoolId },
    });

    if (!classSetup) {
      throw new PreconditionFailedException(
        'Class setup structure not found for this school. Please complete the school structure setup first.',
      );
    }

    return classRecord;
  }

  async update(id: string, dto: UpdateClassDto) {
    const { name, arms } = dto;
    const existingClass = await this.findOne(id);

    return (this.prisma as any).$transaction(async (tx: any) => {
      // 1. Update name if provided
      if (name && name !== existingClass.name) {
        await tx.class.update({
          where: { id },
          data: { name },
        });
      }

      // 2. Update arms if provided (this is a simple implementation: replace all arms)
      if (arms) {
        // Delete existing arms
        await tx.classArm.deleteMany({
          where: { classId: id },
        });

        // Create new arms
        if (arms.length > 0) {
          await tx.classArm.createMany({
            data: arms.map((armName) => ({
              name: armName,
              classId: id,
            })),
          });
        }
      }

      return tx.class.findUnique({
        where: { id },
        include: {
          arms: {
            include: {
              formTeacher: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  staffId: true,
                },
              },
            },
          },
        },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return (this.prisma as any).class.delete({
      where: { id },
    });
  }

  async saveClassSetup(schoolId: string, dto: ClassSetupDto, tx?: any) {
    // Check if school exists
    const prisma = tx || this.prisma;
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new NotFoundException(`School with ID ${schoolId} not found`);
    }

    // Define the core logic
    const execute = async (client: any) => {
      // 1. Upsert the class setup config
      const setup = await client.classSetup.upsert({
        where: { schoolId },
        update: {
          config: dto as any,
        },
        create: {
          schoolId,
          config: dto as any,
        },
      });

      // 2. Clear existing classes and arms for this school to rebuild from setup
      await client.class.deleteMany({
        where: { schoolId },
      });

      // 3. Prepare all classes to be created
      const classData: any[] = [];
      for (const selection of dto.classLevel.selections) {
        const { structure, levels } = selection;
        for (const level of levels) {
          classData.push({
            name: `${structure} ${level}`,
            schoolId,
          });
        }
      }

      // 4. Create all classes and arms efficiently
      for (const data of classData) {
        const newClass = await client.class.create({
          data,
        });

        // Create arms if applicable
        if (
          dto.classArm.hasArms &&
          dto.classArm.arms &&
          dto.classArm.arms.length > 0
        ) {
          await client.classArm.createMany({
            data: dto.classArm.arms.map((armName: string) => ({
              name: armName,
              classId: newClass.id,
            })),
          });
        }
      }

      return setup;
    };

    // Use existing transaction if provided, otherwise start a new one
    if (tx) {
      return execute(tx);
    }
    return (this.prisma as any).$transaction(execute, {
      timeout: 15000, // Increase timeout to 15 seconds for bulk operations
    });
  }

  async getClassSetup(schoolId: string) {
    const setup = await (this.prisma as any).classSetup.findUnique({
      where: { schoolId },
    });

    if (!setup) {
      return null;
    }

    return setup;
  }
}
