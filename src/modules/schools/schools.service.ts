import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { OtpService } from '../auth/otp.service';
import { ClassesService } from '../classes/classes.service';
import { 
  UpdateCalendarDto, 
  UpdateGradingDto, 
  UpdateLocationDto, 
  UpdatePreferencesDto, 
  UpdateBrandingDto 
} from './dto/settings.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SchoolsService {
  private readonly logger = new Logger(SchoolsService.name);

  constructor(
    private prisma: PrismaService,
    private otpService: OtpService,
    private classesService: ClassesService,
  ) {}

  // Maps frontend string role to Prisma enum
  private mapToPrismaUserRole(role: string): any {
    const roleMap: Record<string, string> = {
      'school owner': 'SCHOOL_OWNER',
      'director': 'DIRECTOR',
      'principal': 'PRINCIPAL',
      'teacher': 'TEACHER',
      'ICT admin': 'ICT_ADMIN',
      'others': 'OTHERS',
    };
    return roleMap[role] || 'OTHERS';
  }

  async registerSchool(dto: CreateSchoolDto) {
    
    // 1. Verify OTP first
    await this.otpService.verifyOtp(dto.email, dto.otpCode);

    // 2. Check if user already exists
    const existingUser = await (this.prisma as any).schoolAdmin.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // 4. Create school and admin user in a transaction
    const result = await (this.prisma as any).$transaction(async (tx: any) => {
      const school = await tx.school.create({
        data: {
          name: dto.name,
          shortName: dto.shortName,
          category: dto.category,
          country: dto.country,
          state: dto.state,
          address: dto.address,
          website: dto.website,
        },
      });

      const user = await tx.schoolAdmin.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          password: hashedPassword,
          gender: dto.gender,
          role: this.mapToPrismaUserRole(dto.role), // Use the mapping function
          roleOther: dto.roleOther,
          schoolId: school.id,
        },
      });

      // 4.1 Check for class setup data in onboarding progress
      const progress = await tx.onboardingProgress.findUnique({
        where: { email: dto.email },
      });

      if (progress && progress.data) {
        const onboardingData = progress.data as any;
        // Check if class setup is directly in data or under a key
        const classSetup = onboardingData.classLevel ? onboardingData : onboardingData.classSetup;
        
        if (classSetup && classSetup.classLevel) {
          await this.classesService.saveClassSetup(school.id, classSetup, tx);
        }
      }

      // Exclude password from the returned user object
      const { password, ...adminUser } = user;

      return {
        school,
        adminUser,
      };
    });

    // 5. Clear onboarding progress upon successful registration
    await this.clearOnboardingProgress(dto.email);

    return result;
  }

  async findAll() {
    return (this.prisma as any).school.findMany({
      include: {
        schoolAdmins: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async getSchoolIdByEmail(email: string) {
    const admin = await (this.prisma as any).schoolAdmin.findUnique({
      where: { email },
      select: { schoolId: true },
    });

    if (!admin) {
      throw new NotFoundException(`No school found for the provided email: ${email}`);
    }

    return admin.schoolId;
  }

  // Multi-step onboarding progress tracking
  async saveOnboardingProgress(email: string, step: number, data: any) {
    this.logger.log(`Saving onboarding progress for ${email} at step ${step}`);
    
    const progress = await (this.prisma as any).onboardingProgress.upsert({
      where: { email },
      update: { step, data },
      create: { email, step, data },
    });

    return progress;
  }

  async getOnboardingProgress(email: string) {
    const progress = await (this.prisma as any).onboardingProgress.findUnique({
      where: { email },
    });

    if (!progress) {
      throw new NotFoundException(`No onboarding progress found for email: ${email}`);
    }

    return progress;
  }

  async clearOnboardingProgress(email: string) {
    // Also clear OTPs for this email
    await (this.prisma as any).otp.deleteMany({
      where: { email },
    }).catch(() => null);

    return (this.prisma as any).onboardingProgress.delete({
      where: { email },
    }).catch(() => null); // Ignore if not found
  }

  // ─── SYSTEM SETTINGS ──────────────────────────────────────────────────────

  async getSettings(schoolId: string) {
    const school = await (this.prisma as any).school.findUnique({
      where: { id: schoolId },
      include: {
        academicSessions: {
          include: { terms: true },
          orderBy: { startDate: 'desc' },
        },
        gradingSystem: {
          include: { grades: true },
        },
      },
    });

    if (!school) throw new NotFoundException('School not found');

    return school;
  }

  async updateCalendar(schoolId: string, dto: UpdateCalendarDto) {
    return (this.prisma as any).$transaction(async (tx: any) => {
      // 1. Deactivate all other sessions/terms for this school
      await tx.academicSession.updateMany({
        where: { schoolId, isActive: true },
        data: { isActive: false },
      });

      await tx.academicTerm.updateMany({
        where: { session: { schoolId }, isActive: true },
        data: { isActive: false },
      });

      // 2. Activate the selected session and term
      await tx.academicSession.update({
        where: { id: dto.sessionId },
        data: { 
          isActive: true,
          ...(dto.resumptionDate && { startDate: new Date(dto.resumptionDate) }),
          ...(dto.closingDate && { endDate: new Date(dto.closingDate) }),
        },
      });

      await tx.academicTerm.update({
        where: { id: dto.termId },
        data: { 
          isActive: true,
          ...(dto.resumptionDate && { startDate: new Date(dto.resumptionDate) }),
          ...(dto.closingDate && { endDate: new Date(dto.closingDate) }),
        },
      });

      return { message: 'Academic calendar synchronized successfully' };
    });
  }

  async updateGrading(schoolId: string, dto: UpdateGradingDto) {
    const activeSession = await (this.prisma as any).academicSession.findFirst({
      where: { schoolId, isActive: true },
    });

    if (!activeSession) {
      throw new BadRequestException('No active academic session found. Please set the academic calendar first.');
    }

    return (this.prisma as any).$transaction(async (tx: any) => {
      // 1. Upsert GradingSystem for current session
      const gradingSystem = await tx.gradingSystem.upsert({
        where: {
          schoolId_sessionId_termId: {
            schoolId,
            sessionId: activeSession.id,
            termId: null, // Global for session or specific term? Assuming session-wide for now
          },
        },
        update: {
          ...(dto.passMark && { passMark: dto.passMark }),
        },
        create: {
          schoolId,
          sessionId: activeSession.id,
          passMark: dto.passMark || 40,
        },
      });

      // 2. Replace grades
      await tx.gradeLevel.deleteMany({
        where: { gradingSystemId: gradingSystem.id },
      });

      await tx.gradeLevel.createMany({
        data: dto.grades.map((g) => ({
          gradingSystemId: gradingSystem.id,
          name: g.grade,
          abbreviation: g.grade,
          minScore: g.min,
          maxScore: g.max,
          remark: g.remark,
        })),
      });

      return tx.gradingSystem.findUnique({
        where: { id: gradingSystem.id },
        include: { grades: true },
      });
    });
  }

  async updateLocation(schoolId: string, dto: UpdateLocationDto) {
    return (this.prisma as any).school.update({
      where: { id: schoolId },
      data: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        geofencingRadius: dto.radius,
      },
    });
  }

  async updatePreferences(schoolId: string, dto: UpdatePreferencesDto) {
    return (this.prisma as any).school.update({
      where: { id: schoolId },
      data: {
        emailAlerts: dto.emailAlerts,
        smsAlerts: dto.smsAlerts,
        currency: dto.currency,
        publicationMode: dto.publicationMode,
      },
    });
  }

  async updateBranding(schoolId: string, dto: UpdateBrandingDto) {
    return (this.prisma as any).school.update({
      where: { id: schoolId },
      data: dto,
    });
  }
}
