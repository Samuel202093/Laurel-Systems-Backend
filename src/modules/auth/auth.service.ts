import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpService } from './otp.service';
import { LoginDto } from './dto/login.dto';
import { StudentLoginDto } from './dto/student-login.dto';

/** Shape returned internally after resolving the user across all tables. */
interface ResolvedUser {
  user: Record<string, any>;
  systemRole: string;
  subRole: string | null;
  roles: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
  ) {}

  // ─── LOGIN ──────────────────────────────────────────────────────────────────

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // 1. Find the user in the correct DB table and derive their role from it.
    const resolved = await this.resolveUser(email);
    if (!resolved) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { user, systemRole, subRole, roles } = resolved;

    // 2. Constant-time password comparison (prevents timing-based enumeration).
    const isPasswordValid = await bcrypt.compare(
      password,
      user.password as string,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3. Build JWT payload — role is sourced from the DB table identity.
    const payload: Record<string, any> = {
      sub: user.id,
      email: user.email,
      role: systemRole,
      roles: roles,
    };
    if (subRole) payload.subRole = subRole;
    if (user.schoolId) payload.schoolId = user.schoolId;

    const accessToken = await this.jwtService.signAsync(payload);

    // 4. Strip sensitive fields before returning.
    const { password: _pwd, ...userWithoutPassword } = user;

    return {
      user: {
        ...userWithoutPassword,
        role: systemRole,
        ...(subRole && { subRole }),
      },
      accessToken,
    };
  }

  async studentLogin(studentLoginDto: StudentLoginDto) {
    const { registrationNumber, password } = studentLoginDto;

    // 1. Find the student by registration number
    const student = await this.prisma.student.findUnique({
      where: { registrationNumber },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        gender: true,
        password: true,
        registrationNumber: true,
        roles: true,
        isActive: true,
        schoolId: true,
        classId: true,
        classArmId: true,
        createdAt: true,
        updatedAt: true,
        school: { select: { id: true, name: true, shortName: true } },
      },
    });

    if (!student) {
      throw new UnauthorizedException(
        'Invalid registration number or password',
      );
    }

    // 2. Check if student is active
    if (!student.isActive) {
      throw new UnauthorizedException('Student account is inactive');
    }

    // 3. Constant-time password comparison
    const isPasswordValid = await bcrypt.compare(password, student.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'Invalid registration number or password',
      );
    }

    // 4. Build JWT payload
    const payload: Record<string, any> = {
      sub: student.id,
      email: student.email,
      role: 'STUDENT',
      roles: student.roles || ['STUDENT'],
      schoolId: student.schoolId,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    // 5. Strip sensitive fields
    const { password: _pwd, ...userWithoutPassword } = student;

    return {
      user: {
        ...userWithoutPassword,
        role: 'STUDENT',
      },
      accessToken,
    };
  }

  // ─── LOGOUT ─────────────────────────────────────────────────────────────────

  /**
   * Stateless JWT logout — the client must discard the access token.
   *
   * To fully invalidate tokens server-side before their natural expiry,
   * extend this method to persist the token's JTI in a Redis / DB blacklist
   * and validate it inside JwtAuthGuard on every request.
   */
  async logout(_userId: string, _token: string): Promise<void> {
    // Future: await this.tokenBlacklistService.revoke(_token);
  }

  // ─── CURRENT USER PROFILE ───────────────────────────────────────────────────

  async getProfile(userId: string, role: string) {
    switch (role) {
      case 'SUPER_ADMIN':
        return this.prisma.superAdmin.findUniqueOrThrow({
          where: { id: userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            createdAt: true,
            updatedAt: true,
          },
        });

      case 'SCHOOL_ADMIN':
        return this.prisma.schoolAdmin.findUniqueOrThrow({
          where: { id: userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            gender: true,
            role: true,
            isActive: true,
            avatar: true,
            schoolId: true,
            createdAt: true,
            updatedAt: true,
            school: { select: { id: true, name: true, shortName: true } },
          },
        });

      case 'TEACHER':
        return this.prisma.teacher.findUniqueOrThrow({
          where: { id: userId },
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            gender: true,
            staffId: true,
            staffType: true,
            isActive: true,
            avatar: true,
            schoolId: true,
            classesAssigned: true,
            armsAssigned: true,
            subjects: true,
            createdAt: true,
            updatedAt: true,
            school: { select: { id: true, name: true, shortName: true } },
          },
        });

      case 'STUDENT':
        return this.prisma.student.findUniqueOrThrow({
          where: { id: userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            gender: true,
            registrationNumber: true,
            isActive: true,
            schoolId: true,
            classId: true,
            classArmId: true,
            createdAt: true,
            updatedAt: true,
            school: { select: { id: true, name: true, shortName: true } },
            class: { select: { id: true, name: true } },
            classArm: { select: { id: true, name: true } },
          },
        });

      default:
        throw new UnauthorizedException('Invalid session — unrecognised role');
    }
  }

  // ─── OTP ────────────────────────────────────────────────────────────────────

  async sendOtp(email: string) {
    return this.otpService.sendOtp(email);
  }

  async resendOtp(email: string) {
    return this.otpService.resendOtp(email);
  }

  async verifyOtp(email: string, code: string) {
    return this.otpService.verifyOtp(email, code);
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  /**
   * Searches each user table in priority order.
   * Role is determined from which table the user record exists in —
   * this is database-driven, not hardcoded logic.
   *
   * Priority: SuperAdmin → SchoolAdmin → Teacher → Student
   */
  private async resolveUser(email: string): Promise<ResolvedUser | null> {
    // ── SuperAdmin ──────────────────────────────────────────────────────────
    const superAdmin = await this.prisma.superAdmin.findUnique({
      where: { email },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        password: true,
        roles: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (superAdmin) {
      return {
        user: superAdmin,
        systemRole: 'SUPER_ADMIN',
        subRole: null,
        roles: superAdmin.roles || ['SUPER_ADMIN'],
      };
    }

    // ── SchoolAdmin ─────────────────────────────────────────────────────────
    const schoolAdmin = await this.prisma.schoolAdmin.findUnique({
      where: { email },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        gender: true,
        password: true,
        role: true, // SchoolAdminRole enum — fine-grained position
        roles: true, // roles array
        isActive: true,
        avatar: true,
        schoolId: true,
        createdAt: true,
        updatedAt: true,
        school: { select: { id: true, name: true, shortName: true } },
      },
    });
    if (schoolAdmin) {
      // Merge system role, custom roles, and the specific sub-role enum into one array
      const allRoles = new Set(['SCHOOL_ADMIN', ...(schoolAdmin.roles || [])]);
      if (schoolAdmin.role) allRoles.add(schoolAdmin.role);

      return {
        user: schoolAdmin,
        systemRole: 'SCHOOL_ADMIN',
        subRole: schoolAdmin.role ?? null,
        roles: Array.from(allRoles),
      };
    }

    // ── Teacher ─────────────────────────────────────────────────────────────
    const teacher = await this.prisma.teacher.findUnique({
      where: { email },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        gender: true,
        password: true,
        staffId: true,
        staffType: true,
        roles: true,
        isActive: true,
        avatar: true,
        schoolId: true,
        classesAssigned: true,
        armsAssigned: true,
        subjects: true,
        createdAt: true,
        updatedAt: true,
        school: { select: { id: true, name: true, shortName: true } },
      },
    });
    if (teacher) {
      return {
        user: teacher,
        systemRole: 'TEACHER',
        subRole: null,
        roles: teacher.roles || ['TEACHER'],
      };
    }

    // ── Student ─────────────────────────────────────────────────────────────
    // Student.email is nullable and not @unique — findFirst is required.
    const student = await this.prisma.student.findFirst({
      where: { email },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        gender: true,
        password: true,
        registrationNumber: true,
        roles: true,
        isActive: true,
        schoolId: true,
        classId: true,
        classArmId: true,
        createdAt: true,
        updatedAt: true,
        school: { select: { id: true, name: true, shortName: true } },
      },
    });
    if (student) {
      return {
        user: student,
        systemRole: 'STUDENT',
        subRole: null,
        roles: student.roles || ['STUDENT'],
      };
    }

    return null;
  }
}
