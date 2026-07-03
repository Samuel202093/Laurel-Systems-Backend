import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

@Injectable()
export class BankAccountsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateBankAccountDto) {
    // Verify school exists
    const school = await (this.prisma as any).school.findUnique({
      where: { id: dto.schoolId },
    });

    if (!school) {
      throw new NotFoundException(`School with ID ${dto.schoolId} not found`);
    }

    // Check if account already exists for this school (unique constraint)
    const existing = await (this.prisma as any).bankAccount.findFirst({
      where: {
        schoolId: dto.schoolId,
        accountNumber: dto.accountNumber,
        bankName: dto.bankName,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Bank account with this number already exists for this school`,
      );
    }

    // If this is set as primary, unset other primary accounts for this school
    if (dto.isPrimary) {
      await (this.prisma as any).bankAccount.updateMany({
        where: { schoolId: dto.schoolId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return (this.prisma as any).bankAccount.create({
      data: {
        ...dto,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  async findAllBySchoolId(schoolId: string) {
    return (this.prisma as any).bankAccount.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const bankAccount = await (this.prisma as any).bankAccount.findUnique({
      where: { id },
    });

    if (!bankAccount) {
      throw new NotFoundException(`Bank account with ID ${id} not found`);
    }

    return bankAccount;
  }

  async update(id: string, dto: UpdateBankAccountDto) {
    const bankAccount = await this.findOne(id);

    // If updating to primary, unset others
    if (dto.isPrimary) {
      await (this.prisma as any).bankAccount.updateMany({
        where: { schoolId: bankAccount.schoolId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return (this.prisma as any).bankAccount.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return (this.prisma as any).bankAccount.delete({
      where: { id },
    });
  }
}
