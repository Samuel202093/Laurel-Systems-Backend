import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PromoteStudentDto, PromoteMultipleStudentsDto } from './dto/promote-student.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async create(schoolId: string, dto: CreateStudentDto) {
    const { email, registrationNumber, ...rest } = dto;
    
    // 1. Clean classId and classArmId
    const classId = dto.classId && dto.classId.trim() !== '' ? dto.classId : undefined;
    const classArmId = dto.classArmId && dto.classArmId.trim() !== '' ? dto.classArmId : undefined;

    // 2. Map fields and clean extra fields that shouldn't go to Prisma data
    const studentData: any = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      registrationNumber: dto.registrationNumber,
      phone: dto.phone || dto.phoneNumber,
      gender: dto.gender,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      parentsFullName: dto.parentsFullName,
      parentsPhoneNumber: dto.parentsPhoneNumber,
      parentsEmail: dto.parentsEmail,
      address: dto.address,
      nationality: dto.nationality,
      stateOfOrigin: dto.stateOfOrigin,
      lgaOfOrigin: dto.lgaOfOrigin,
      country: dto.country,
      state: dto.state,
    };

    // 3. Verify school exists
    const school = await (this.prisma as any).school.findUnique({
      where: { id: schoolId },
    });
    if (!school) {
      throw new NotFoundException(`School with ID ${schoolId} not found`);
    }

    // 4. Check registration number uniqueness
    const existingStudentByReg = await (this.prisma as any).student.findUnique({
      where: { registrationNumber },
    });
    if (existingStudentByReg) {
      throw new ConflictException(`A student with registration number ${registrationNumber} already exists`);
    }

    // 5. Verify class and arm if provided
    if (classId) {
      const cls = await (this.prisma as any).class.findUnique({
        where: { id: classId, schoolId },
      });
      if (!cls) throw new NotFoundException(`Class with ID ${classId} not found in this school`);
    }
    if (classArmId) {
      const arm = await (this.prisma as any).classArm.findUnique({
        where: { id: classArmId },
        include: { class: true },
      });
      if (!arm || arm.class.schoolId !== schoolId) {
        throw new NotFoundException(`Class Arm with ID ${classArmId} not found in this school`);
      }
    }

    // 6. Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 7. Create student
    const student = await (this.prisma as any).student.create({
      data: {
        ...studentData,
        password: hashedPassword,
        schoolId,
        classId,
        classArmId,
        roles: ['STUDENT'],
      },
      include: {
        class: true,
        classArm: true,
      },
    });

    // 8. Send welcome email
    if (student.email) {
      try {
        await this.mailService.sendStudentWelcomeEmail(
          student.email,
          `${student.firstName} ${student.lastName}`,
          student.registrationNumber,
          tempPassword,
          school.name,
        );
      } catch (error) {
        console.error(`Failed to send welcome email to student ${student.email}:`, error);
      }
    }

    const { password, ...result } = student;
    return result;
  }

  async findAll(schoolId: string, query: { page?: number; limit?: number; search?: string; classId?: string; classArmId?: string }) {
    const { page = 1, limit = 10, search, classId, classArmId } = query;
    const skip = (page - 1) * limit;

    const where: any = { schoolId };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { registrationNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (classId) where.classId = classId;
    if (classArmId) where.classArmId = classArmId;

    const [students, total] = await Promise.all([
      (this.prisma as any).student.findMany({
        where,
        skip,
        take: limit,
        include: {
          class: true,
          classArm: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).student.count({ where }),
    ]);

    return {
      data: students.map(({ password, ...s }: any) => s),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(schoolId: string, id: string) {
    const student = await (this.prisma as any).student.findUnique({
      where: { id, schoolId },
      include: {
        class: true,
        classArm: true,
        school: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException(`Student with ID ${id} not found in this school`);
    }

    const { password, ...result } = student;
    return result;
  }

  async update(schoolId: string, id: string, dto: UpdateStudentDto) {
    const student = await (this.prisma as any).student.findUnique({
      where: { id, schoolId },
    });

    if (!student) {
      throw new NotFoundException(`Student with ID ${id} not found in this school`);
    }

    if (dto.registrationNumber && dto.registrationNumber !== student.registrationNumber) {
      const existing = await (this.prisma as any).student.findUnique({
        where: { registrationNumber: dto.registrationNumber },
      });
      if (existing) {
        throw new ConflictException(`A student with registration number ${dto.registrationNumber} already exists`);
      }
    }

    // Clean and map update data
    const updateData: any = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      registrationNumber: dto.registrationNumber,
      phone: dto.phone || dto.phoneNumber,
      gender: dto.gender,
      parentsFullName: dto.parentsFullName,
      parentsPhoneNumber: dto.parentsPhoneNumber,
      parentsEmail: dto.parentsEmail,
      address: dto.address,
      nationality: dto.nationality,
      stateOfOrigin: dto.stateOfOrigin,
      lgaOfOrigin: dto.lgaOfOrigin,
      country: dto.country,
      state: dto.state,
      classId: dto.classId && dto.classId.trim() !== '' ? dto.classId : undefined,
      classArmId: dto.classArmId && dto.classArmId.trim() !== '' ? dto.classArmId : undefined,
    };

    if (dto.dateOfBirth) {
      updateData.dateOfBirth = new Date(dto.dateOfBirth);
    }

    // Remove undefined fields to prevent Prisma from trying to update them to undefined
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const updated = await (this.prisma as any).student.update({
      where: { id, schoolId },
      data: updateData,
      include: {
        class: true,
        classArm: true,
      },
    });

    const { password, ...result } = updated;
    return result;
  }

  async remove(schoolId: string, id: string) {
    const student = await (this.prisma as any).student.findUnique({
      where: { id, schoolId },
    });

    if (!student) {
      throw new NotFoundException(`Student with ID ${id} not found in this school`);
    }

    return (this.prisma as any).student.delete({
      where: { id, schoolId },
    });
  }

  async promote(schoolId: string, dto: PromoteStudentDto) {
    const { studentId, targetClassId, targetClassArmId } = dto;

    const student = await (this.prisma as any).student.findUnique({
      where: { id: studentId, schoolId },
    });
    if (!student) throw new NotFoundException(`Student with ID ${studentId} not found in this school`);

    // Verify target class and arm belong to this school
    const [targetClass, targetArm] = await Promise.all([
      (this.prisma as any).class.findUnique({ where: { id: targetClassId, schoolId } }),
      (this.prisma as any).classArm.findUnique({
        where: { id: targetClassArmId },
        include: { class: true },
      }),
    ]);

    if (!targetClass) throw new NotFoundException(`Target class not found in this school`);
    if (!targetArm || targetArm.class.schoolId !== schoolId) throw new NotFoundException(`Target class arm not found in this school`);
    if (targetArm.classId !== targetClassId) {
      throw new BadRequestException(`Class arm does not belong to the target class`);
    }

    const updated = await (this.prisma as any).student.update({
      where: { id: studentId, schoolId },
      data: {
        classId: targetClassId,
        classArmId: targetClassArmId,
      },
      include: {
        class: true,
        classArm: true,
      },
    });

    const { password, ...result } = updated;
    return result;
  }

  async promoteMultiple(schoolId: string, dto: PromoteMultipleStudentsDto) {
    const { studentIds, targetClassId, targetClassArmId } = dto;

    // Verify target class and arm belong to this school
    const [targetClass, targetArm] = await Promise.all([
      (this.prisma as any).class.findUnique({ where: { id: targetClassId, schoolId } }),
      (this.prisma as any).classArm.findUnique({
        where: { id: targetClassArmId },
        include: { class: true },
      }),
    ]);

    if (!targetClass) throw new NotFoundException(`Target class not found in this school`);
    if (!targetArm || targetArm.class.schoolId !== schoolId) throw new NotFoundException(`Target class arm not found in this school`);
    if (targetArm.classId !== targetClassId) {
      throw new BadRequestException(`Class arm does not belong to the target class`);
    }

    // Update only students belonging to this school
    const updateResult = await (this.prisma as any).student.updateMany({
      where: {
        id: { in: studentIds },
        schoolId,
      },
      data: {
        classId: targetClassId,
        classArmId: targetClassArmId,
      },
    });

    return {
      message: `Successfully promoted ${updateResult.count} students`,
      targetClass: targetClass.name,
      targetArm: targetArm.name,
    };
  }
}
