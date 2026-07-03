import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

@Injectable()
export class SubjectsService {
  constructor(private prisma: PrismaService) {}

  async create(schoolId: string, dto: CreateSubjectDto) {
    // Check if subject with same name already exists in the school
    const existingSubject = await (this.prisma as any).subject.findFirst({
      where: {
        schoolId,
        name: { equals: dto.name, mode: 'insensitive' },
      },
    });

    if (existingSubject) {
      throw new ConflictException(
        `Subject with name "${dto.name}" already exists in this school`,
      );
    }

    // Check if code is unique if provided
    if (dto.code) {
      const existingCode = await (this.prisma as any).subject.findFirst({
        where: {
          schoolId,
          code: { equals: dto.code, mode: 'insensitive' },
        },
      });
      if (existingCode) {
        throw new ConflictException(
          `Subject with code "${dto.code}" already exists in this school`,
        );
      }
    }

    return (this.prisma as any).subject.create({
      data: {
        ...dto,
        schoolId,
      },
    });
  }

  async findAll(schoolId: string) {
    return (this.prisma as any).subject.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const subject = await (this.prisma as any).subject.findUnique({
      where: { id },
    });

    if (!subject) {
      throw new NotFoundException(`Subject with ID "${id}" not found`);
    }

    return subject;
  }

  async update(id: string, dto: UpdateSubjectDto) {
    const subject = await this.findOne(id);

    // Check uniqueness for name if being updated
    if (dto.name && dto.name !== subject.name) {
      const existingName = await (this.prisma as any).subject.findFirst({
        where: {
          schoolId: subject.schoolId,
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (existingName) {
        throw new ConflictException(
          `Subject with name "${dto.name}" already exists`,
        );
      }
    }

    // Check uniqueness for code if being updated
    if (dto.code && dto.code !== subject.code) {
      const existingCode = await (this.prisma as any).subject.findFirst({
        where: {
          schoolId: subject.schoolId,
          code: { equals: dto.code, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (existingCode) {
        throw new ConflictException(
          `Subject with code "${dto.code}" already exists`,
        );
      }
    }

    return (this.prisma as any).subject.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return (this.prisma as any).subject.delete({
      where: { id },
    });
  }
}
