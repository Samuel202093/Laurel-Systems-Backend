import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFeeDto } from './dto/create-fee.dto';
import { UpdateFeeDto } from './dto/update-fee.dto';

@Injectable()
export class FeesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── helpers ──────────────────────────────────────────────────────────────

  /** Throws 404 if school not found — used to validate schoolId on create */
  private async assertSchoolExists(schoolId: string) {
    const school = await (this.prisma as any).school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });
    if (!school) {
      throw new NotFoundException(`School with ID "${schoolId}" not found`);
    }
  }

  /** Fetches a fee by ID and verifies it belongs to the given school */
  private async findOneSecure(id: string, schoolId: string) {
    const fee = await (this.prisma as any).feeConfiguration.findUnique({
      where: { id },
    });
    if (!fee || fee.schoolId !== schoolId) {
      throw new NotFoundException(`Fee configuration with ID "${id}" not found`);
    }
    return fee;
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  /**
   * Create a new fee configuration for a school.
   * Validates: school exists, no duplicate (schoolId+feeName+session+term).
   * installments is required when paymentPlan === 'installments'.
   */
  async create(dto: CreateFeeDto) {
    const { schoolId, feeName, session, term, paymentPlan, installments, dueDate, amount, ...rest } = dto;

    // 1. Validate school
    await this.assertSchoolExists(schoolId);

    // 2. Guard: installments required when paymentPlan is installments
    if (paymentPlan === 'installments' && (!installments || installments < 2)) {
      throw new BadRequestException(
        'installments (min 2) is required when paymentPlan is "installments"',
      );
    }

    // 3. Duplicate guard (uses the DB unique constraint as source of truth, but
    //    give a friendly message before hitting the DB error)
    const existing = await (this.prisma as any).feeConfiguration.findUnique({
      where: {
        schoolId_feeName_session_term: { schoolId, feeName, session, term },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `A fee named "${feeName}" already exists for ${term} of ${session}`,
      );
    }

    // 4. Create
    try {
      return await (this.prisma as any).feeConfiguration.create({
        data: {
          schoolId,
          feeName,
          feeCategory: rest.feeCategory,
          session,
          term,
          amount,
          currency: rest.currency ?? 'NGN',
          applicableClasses: rest.applicableClasses,
          dueDate: new Date(dueDate),
          paymentPlan,
          installments: paymentPlan === 'installments' ? installments : null,
          notes: rest.notes ?? null,
          bankAccountIds: rest.bankAccountIds || [],
        },
      });
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          `A fee named "${feeName}" already exists for ${term} of ${session}`,
        );
      }
      console.error('[FeesService.create]', error);
      throw new InternalServerErrorException('Failed to create fee configuration');
    }
  }

  /**
   * List all active fee configurations for a school.
   * Supports optional filtering by session, term, and category for scalability.
   */
  async findAllBySchool(
    schoolId: string,
    filters?: { session?: string; term?: string; feeCategory?: string },
  ) {
    const where: Record<string, any> = { schoolId, isActive: true };

    if (filters?.session) where.session = filters.session;
    if (filters?.term) where.term = filters.term;
    if (filters?.feeCategory && filters.feeCategory !== 'All') {
      where.feeCategory = { has: filters.feeCategory };
    }

    return (this.prisma as any).feeConfiguration.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  /**
   * Fetch a single fee configuration, scoped to its school.
   */
  async findOne(id: string, schoolId: string) {
    return this.findOneSecure(id, schoolId);
  }

  /**
   * Update a fee configuration. schoolId is immutable.
   * Re-validates the unique constraint if feeName/session/term change.
   */
  async update(id: string, schoolId: string, dto: UpdateFeeDto) {
    const { schoolId: _ignored, dueDate, amount, paymentPlan, installments, ...rest } = dto;

    // Confirm fee exists and belongs to school
    const fee = await this.findOneSecure(id, schoolId);

    // Guard installments consistency
    const effectivePlan = paymentPlan ?? fee.paymentPlan;
    const effectiveInstallments = installments ?? fee.installments;
    if (
      effectivePlan === 'installments' &&
      (!effectiveInstallments || effectiveInstallments < 2)
    ) {
      throw new BadRequestException(
        'installments (min 2) is required when paymentPlan is "installments"',
      );
    }

    // Build clean update payload
    const data: Record<string, any> = { ...rest };

    if (amount !== undefined) data.amount = amount;
    if (dueDate !== undefined) data.dueDate = new Date(dueDate);
    if (paymentPlan !== undefined) {
      data.paymentPlan = paymentPlan;
      data.installments = paymentPlan === 'installments' ? (installments ?? fee.installments) : null;
    }
    if (rest.bankAccountIds !== undefined) data.bankAccountIds = rest.bankAccountIds;

    try {
      return await (this.prisma as any).feeConfiguration.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'A fee with the same name already exists for this session and term',
        );
      }
      console.error('[FeesService.update]', error);
      throw new InternalServerErrorException('Failed to update fee configuration');
    }
  }

  /**
   * Fetch all active fees applicable to a specific student based on their class.
   * This is used by the student dashboard to display outstanding or payable fees.
   */
  async findFeesForStudent(studentId: string, schoolId: string) {
    // 1. Resolve student and their class name
    const student = await (this.prisma as any).student.findUnique({
      where: { id: studentId, schoolId },
      include: { class: { select: { name: true } } },
    });

    if (!student) {
      throw new NotFoundException(`Student with ID "${studentId}" not found`);
    }

    if (!student.class) {
      throw new BadRequestException('Student is not currently assigned to a class');
    }

    const className = student.class.name;

    // 2. Fetch fees targeting this class and include payment history for this student
    return (this.prisma as any).feeConfiguration.findMany({
      where: {
        schoolId,
        isActive: true,
        applicableClasses: {
          has: className,
        },
      },
      include: {
        paymentRecords: {
          where: { studentId },
          select: {
            id: true,
            amount: true,
            paymentPlan: true,
            installmentNumber: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }],
    });
  }

  /**
   * Soft-delete: marks a fee as inactive rather than hard-deleting it,
   * preserving historical invoice records that reference it.
   */
  async softDelete(id: string, schoolId: string) {
    await this.findOneSecure(id, schoolId);

    return (this.prisma as any).feeConfiguration.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
