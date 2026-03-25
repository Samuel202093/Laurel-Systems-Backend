import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { OtpService } from '../auth/otp.service';
import { ClassesService } from '../classes/classes.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SchoolsService {
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
    // await this.otpService.verifyOtp(dto.email, dto.otpCode);

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
          await this.classesService.saveClassSetup(school.id, classSetup);
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
    const progress = await (this.prisma as any).onboardingProgress.upsert({
      where: { email },
      update: { step, data },
      create: { email, step, data },
    });

    // If entering Step 2 (About You), automatically trigger OTP send
    if (step === 2) {
      const otpInfo = await this.otpService.sendOtp(email);
      return { ...progress, otpInfo };
    }

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
    return (this.prisma as any).onboardingProgress.delete({
      where: { email },
    }).catch(() => null); // Ignore if not found
  }
}
