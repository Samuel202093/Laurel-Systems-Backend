import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TeachersService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async create(schoolId: string, dto: CreateTeacherDto) {
    // ... existing implementation
    const school = await (this.prisma as any).school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new NotFoundException(`School with ID ${schoolId} not found`);
    }

    const existingEmail = await (this.prisma as any).teacher.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException('A teacher with this email already exists');
    }

    const existingStaffId = await (this.prisma as any).teacher.findUnique({
      where: { staffId: dto.staffId },
    });
    if (existingStaffId) {
      throw new ConflictException('A teacher with this Staff ID already exists');
    }

    // Generate a secure temporary password
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Map subject (string) and subjects (array) for compatibility
    const subjectsSet = new Set<string>();
    if (dto.subjects) dto.subjects.forEach(s => subjectsSet.add(s));
    if (dto.subject) subjectsSet.add(dto.subject);
    const teacherSubjects = Array.from(subjectsSet);

    const teacher = await (this.prisma as any).teacher.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        password: hashedPassword,
        phone: dto.phoneNumber,
        staffId: dto.staffId,
        maritalStatus: dto.maritalStatus,
        staffType: dto.staffType,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        gender: dto.gender,
        nationality: dto.nationality,
        stateOfOrigin: dto.stateOfOrigin,
        lgaOfOrigin: dto.lgaOfOrigin,
        countryOfResidence: dto.countryOfResidence,
        stateOfResidence: dto.stateOfResidence,
        address: dto.address,
        subjects: teacherSubjects,
        department: dto.department,
        classesAssigned: dto.classesAssigned || [],
        armsAssigned: dto.armsAssigned || [],
        formTeacherClasses: dto.formTeacherClasses || [],
        formTeacherArms: dto.formTeacherArms || [],
        formTeacherAssignment: dto.formTeacherAssignment,
        nextOfKin: dto.nextOfKin as any,
        schoolId: schoolId,
        roles: ['TEACHER'], // Default role
      },
    });

    // Send welcome email with login details
    await this.mailService.sendTeacherWelcomeEmail(
      teacher.email,
      teacher.fullName,
      teacher.staffId,
      tempPassword,
    );

    const { password, ...result } = teacher;
    return result;
  }

  async assignRoles(id: string, roles: string[]) {
    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }

    // Filter out duplicates and empty roles
    const uniqueRoles = Array.from(new Set(roles.filter(r => r.trim() !== '')));

    const updatedTeacher = await (this.prisma as any).teacher.update({
      where: { id },
      data: {
        roles: uniqueRoles,
      },
    });

    const { password, ...result } = updatedTeacher;
    return result;
  }

  async update(id: string, dto: UpdateTeacherDto) {
    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }

    // Check email uniqueness if email is being updated
    if (dto.email && dto.email !== teacher.email) {
      const existingEmail = await (this.prisma as any).teacher.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException('A teacher with this email already exists');
      }
    }

    // Check staffId uniqueness if staffId is being updated
    if (dto.staffId && dto.staffId !== teacher.staffId) {
      const existingStaffId = await (this.prisma as any).teacher.findUnique({
        where: { staffId: dto.staffId },
      });
      if (existingStaffId) {
        throw new ConflictException('A teacher with this Staff ID already exists');
      }
    }

    // Map subject (string) and subjects (array) for compatibility if provided
    let teacherSubjects = dto.subjects;
    if (dto.subject) {
      const subjectsSet = new Set(teacherSubjects || []);
      subjectsSet.add(dto.subject);
      teacherSubjects = Array.from(subjectsSet);
    }

    const updatedTeacher = await (this.prisma as any).teacher.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phoneNumber,
        staffId: dto.staffId,
        maritalStatus: dto.maritalStatus,
        staffType: dto.staffType,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        nationality: dto.nationality,
        stateOfOrigin: dto.stateOfOrigin,
        lgaOfOrigin: dto.lgaOfOrigin,
        countryOfResidence: dto.countryOfResidence,
        stateOfResidence: dto.stateOfResidence,
        address: dto.address,
        subjects: teacherSubjects,
        department: dto.department,
        classesAssigned: dto.classesAssigned,
        armsAssigned: dto.armsAssigned,
        formTeacherClasses: dto.formTeacherClasses,
        formTeacherArms: dto.formTeacherArms,
        formTeacherAssignment: dto.formTeacherAssignment,
        nextOfKin: dto.nextOfKin ? (dto.nextOfKin as any) : undefined,
      },
    });

    const { password, ...result } = updatedTeacher;
    return result;
  }

  async remove(id: string) {
    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }

    return (this.prisma as any).teacher.delete({
      where: { id },
    });
  }

  async suspend(id: string) {
    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }

    if (!teacher.isActive) {
      throw new BadRequestException('Teacher is already suspended');
    }

    return (this.prisma as any).teacher.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async activate(id: string) {
    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }

    if (teacher.isActive) {
      throw new BadRequestException('Teacher is already active');
    }

    return (this.prisma as any).teacher.update({
      where: { id },
      data: { isActive: true },
    });
  }

  async findAll(schoolId: string) {
    return (this.prisma as any).teacher.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }

    return teacher;
  }

  /**
   * Fetch classes and arms assigned to a specific teacher.
   */
  async getAssignedClasses(id: string, schoolId: string) {
    const teacher = (await this.findOne(id)) as any;

    if (teacher.schoolId !== schoolId) {
      throw new BadRequestException('Teacher does not belong to this school');
    }

    // The teacher model has arrays: classesAssigned (IDs or names) and armsAssigned (IDs or names)
    // To be robust, we search by both ID and name since the DTO examples suggest names.
    const classes = await (this.prisma as any).class.findMany({
      where: {
        schoolId,
        OR: [
          { id: { in: teacher.classesAssigned } },
          { name: { in: teacher.classesAssigned } },
        ],
      },
      include: {
        arms: {
          where: {
            OR: [
              { id: { in: teacher.armsAssigned } },
              { name: { in: teacher.armsAssigned } },
            ],
          },
        },
      },
    });

    return classes;
  }

  /**
   * Fetch students belonging to classes/arms assigned to a teacher.
   */
  async getAssignedStudents(id: string, schoolId: string) {
    const teacher = (await this.findOne(id)) as any;

    if (teacher.schoolId !== schoolId) {
      throw new BadRequestException('Teacher does not belong to this school');
    }

    // Fetch students who are in the classes or arms assigned to the teacher
    // We search by both ID and name for the assigned classes and arms
    const students = await (this.prisma as any).student.findMany({
      where: {
        schoolId,
        OR: [
          { classId: { in: teacher.classesAssigned } },
          { class: { name: { in: teacher.classesAssigned } } },
          { classArmId: { in: teacher.armsAssigned } },
          { classArm: { name: { in: teacher.armsAssigned } } },
        ],
      },
      include: {
        class: true,
        classArm: true,
      },
      orderBy: [
        { class: { name: 'asc' } },
        { lastName: 'asc' },
      ],
    });

    return students.map(({ password, ...s }: any) => s);
  }
}
