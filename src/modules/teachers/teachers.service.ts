import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TeachersService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private cloudinary: CloudinaryService,
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
      throw new ConflictException(
        'A teacher with this Staff ID already exists',
      );
    }

    // Generate a secure temporary password
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Map subject (string) and subjects (array) for compatibility
    const subjectsSet = new Set<string>();
    if (dto.subjects) dto.subjects.forEach((s) => subjectsSet.add(s));
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
      school.name,
    );

    const { password, ...result } = teacher;
    return {
      ...result,
      status: result.isActive ? 'Active' : 'Suspended',
    };
  }

  async assignRoles(id: string, roles: string[]) {
    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }

    // Filter out duplicates and empty roles
    const uniqueRoles = Array.from(
      new Set(roles.filter((r) => r.trim() !== '')),
    );

    const updatedTeacher = await (this.prisma as any).teacher.update({
      where: { id },
      data: {
        roles: uniqueRoles,
      },
    });

    const { password, ...result } = updatedTeacher;
    return {
      ...result,
      status: result.isActive ? 'Active' : 'Suspended',
    };
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
        throw new ConflictException(
          'A teacher with this Staff ID already exists',
        );
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
    return {
      ...result,
      status: result.isActive ? 'Active' : 'Suspended',
    };
  }

  async remove(id: string) {
    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }

    // Delete profile image from Cloudinary if it exists
    if (teacher.avatarPublicId) {
      try {
        await this.cloudinary.deleteFile(teacher.avatarPublicId);
      } catch (error) {
        console.error('Failed to delete avatar from Cloudinary:', error);
      }
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

    const updated = await (this.prisma as any).teacher.update({
      where: { id },
      data: { isActive: false },
    });

    const { password, ...result } = updated;
    return {
      ...result,
      status: 'Suspended',
    };
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

    const updated = await (this.prisma as any).teacher.update({
      where: { id },
      data: { isActive: true },
    });

    const { password, ...result } = updated;
    return {
      ...result,
      status: 'Active',
    };
  }

  async updateAvatar(id: string, file: Express.Multer.File) {
    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }

    try {
      // Delete previous image from Cloudinary if it exists
      if (teacher.avatarPublicId) {
        await this.cloudinary.deleteFile(teacher.avatarPublicId);
      }

      // Upload new image
      const result = await this.cloudinary.uploadFile(file);

      const updatedTeacher = await (this.prisma as any).teacher.update({
        where: { id },
        data: {
          avatar: result.secure_url,
          avatarPublicId: result.public_id,
        },
      });

      const { password, ...res } = updatedTeacher;
      return {
        ...res,
        status: res.isActive ? 'Active' : 'Suspended',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        error.message || 'Failed to update profile image',
      );
    }
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id },
      include: { school: { select: { name: true } } },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await (this.prisma as any).teacher.update({
      where: { id },
      data: { password: hashedPassword },
    });

    // Send email notification with new password
    await this.mailService.sendPasswordChangeEmail(
      teacher.email,
      teacher.fullName,
      dto.newPassword,
      teacher.school?.name,
    );

    return { message: 'Password changed successfully' };
  }

  async findAll(schoolId: string) {
    const teachers = await (this.prisma as any).teacher.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
    });

    return teachers.map(({ password, ...teacher }: any) => ({
      ...teacher,
      status: teacher.isActive ? 'Active' : 'Suspended',
    }));
  }

  async findOne(id: string) {
    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }

    const { password, ...result } = teacher;
    return {
      ...result,
      status: result.isActive ? 'Active' : 'Suspended',
    };
  }

  /**
   * Fetch classes and arms assigned to a specific teacher.
   */
  async getAssignedClasses(id: string, schoolId: string) {
    const teacher = await this.findOne(id);

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
    const teacher = await this.findOne(id);

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
      orderBy: [{ class: { name: 'asc' } }, { lastName: 'asc' }],
    });

    return students.map(({ password, ...s }: any) => s);
  }
}
