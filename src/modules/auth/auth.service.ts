import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpService } from './otp.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private otpService: OtpService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // 1. Try to find user in different tables
    let user: any = null;
    let role: string | null = null;

    // Check SuperAdmin table
    user = await (this.prisma as any).superAdmin.findUnique({
      where: { email },
    });
    if (user) {
      role = 'SUPER_ADMIN';
    }

    // Check SchoolAdmin table if not found in SuperAdmin
    if (!user) {
      user = await (this.prisma as any).schoolAdmin.findUnique({
        where: { email },
        include: { school: true },
      });
      if (user) {
        role = 'SCHOOL_ADMIN';
        // Include specific sub-role for SchoolAdmin
        (user as any).subRole = user.role;
      }
    }

    // Check Teacher table if not found in SchoolAdmin
    if (!user) {
      user = await (this.prisma as any).teacher.findUnique({
        where: { email },
        include: { school: true },
      });
      if (user) {
        role = 'TEACHER';
      }
    }

    // Check Student table if not found in Teacher
    if (!user) {
      user = await (this.prisma as any).student.findUnique({
        where: { email },
        include: { school: true },
      });
      if (user) {
        role = 'STUDENT';
      }
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3. Generate JWT token
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: role,
      subRole: (user as any).subRole || null,
      schoolId: (user as any).schoolId || null 
    };
    
    const token = await this.jwtService.signAsync(payload);

    // 4. Return professional response
    const { password: _, ...userWithoutPassword } = user;
    return {
      user: {
        ...userWithoutPassword,
        role,
      },
      accessToken: token,
    };
  }

  async sendOtp(email: string) {
    return this.otpService.sendOtp(email);
  }

  async resendOtp(email: string) {
    return this.otpService.resendOtp(email);
  }

  async verifyOtp(email: string, code: string) {
    return this.otpService.verifyOtp(email, code);
  }
}
