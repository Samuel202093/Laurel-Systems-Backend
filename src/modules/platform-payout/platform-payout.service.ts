import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PayoutStatus, PayoutMethod, SweepResult } from './types';
import { PlatformPayout } from '@prisma/client';

@Injectable()
export class PlatformPayoutService {
  private readonly logger = new Logger(PlatformPayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ─── Create payout record ──────────────────────────────────────────────────
  // Called from PaymentsService after a transaction is verified as successful.

  async createPayoutRecord(params: {
    transactionId: string;
    schoolId: string;
    processor: string;
    platformAmountKobo: number;
    platformFlatKobo: number;
    platformPercentKobo: number;
    gatewayFeeKobo: number;
  }): Promise<void> {
    const isNativeSplit = this.supportsNativeSplit(params.processor);

    await this.prisma.platformPayout.create({
      data: {
        transactionId: params.transactionId,
        schoolId: params.schoolId,
        processor: params.processor,
        platformAmountKobo: params.platformAmountKobo,
        platformFlatKobo: params.platformFlatKobo,
        platformPercentKobo: params.platformPercentKobo,
        gatewayFeeKobo: params.gatewayFeeKobo,
        status: isNativeSplit ? PayoutStatus.AUTO_SPLIT : PayoutStatus.PENDING,
        method: isNativeSplit
          ? PayoutMethod.GATEWAY_SPLIT
          : PayoutMethod.MANUAL_TRANSFER,
      },
    });

    this.logger.log(
      `Payout record created for transaction ${params.transactionId} — ` +
        `${isNativeSplit ? 'AUTO_SPLIT (gateway handles it)' : 'PENDING manual transfer'}`,
    );
  }

  // ─── Sweep pending payouts (scheduled) ────────────────────────────────────
  // Runs every day at 2 AM. Can also be triggered manually via the admin endpoint.
  // Groups payouts by processor and batches them into a single transfer where possible.

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async sweepPendingPayouts(): Promise<SweepResult> {
    this.logger.log('Starting payout sweep...');

    const pending = await this.prisma.platformPayout.findMany({
      where: {
        status: PayoutStatus.PENDING,
        method: PayoutMethod.MANUAL_TRANSFER,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (pending.length === 0) {
      this.logger.log('No pending payouts to sweep');
      return { swept: 0, failed: 0, totalKobo: 0 };
    }

    this.logger.log(`Found ${pending.length} pending payout(s)`);

    // Group by processor so we can batch transfers
    const byProcessor = pending.reduce(
      (acc, p) => {
        const proc = p.processor as string;
        if (!acc[proc]) acc[proc] = [];
        acc[proc].push(p);
        return acc;
      },
      {} as Record<string, PlatformPayout[]>,
    );

    let swept = 0;
    let failed = 0;
    let totalKobo = 0;

    for (const [processor, payouts] of Object.entries(byProcessor)) {
      const batchAmount = payouts.reduce(
        (s: number, p: any) => s + (p.platformAmountKobo as number),
        0,
      );
      const ids = payouts.map((p: any) => p.id as string);

      try {
        const ref = await this.initiateTransfer(processor, batchAmount, ids);

        // Mark all as PROCESSING with disbursement reference
        await this.prisma.platformPayout.updateMany({
          where: { id: { in: ids } },
          data: {
            status: PayoutStatus.PROCESSING,
            disbursementReference: ref,
            initiatedAt: new Date(),
            batchNote: `Batch of ${payouts.length} payout(s) — ${new Date().toISOString()}`,
          },
        });

        swept += payouts.length;
        totalKobo += batchAmount;
        this.logger.log(
          `Sweep: initiated ₦${batchAmount / 100} transfer via ${processor} — ref: ${ref}`,
        );
      } catch (error) {
        this.logger.error(`Sweep failed for ${processor}: ${error.message}`);
        failed += payouts.length;
      }
    }

    return { swept, failed, totalKobo };
  }

  // ─── Handle transfer webhook e.

  async handleTransferWebhook(processor: string, body: any): Promise<void> {
    let disbursementRef: string | undefined;
    let status: 'settled' | 'failed' | undefined;

    if (processor === 'korapay') {
      disbursementRef = body?.data?.reference;
      status = body?.data?.status === 'success' ? 'settled' : 'failed';
    }

    if (!disbursementRef || !status) return;

    const payouts = await this.prisma.platformPayout.findMany({
      where: { disbursementReference: disbursementRef },
    });

    if (payouts.length === 0) {
      this.logger.warn(
        `Transfer webhook: no payouts found for ref ${disbursementRef}`,
      );
      return;
    }

    await this.prisma.platformPayout.updateMany({
      where: { disbursementReference: disbursementRef },
      data: {
        status:
          status === 'settled' ? PayoutStatus.SETTLED : PayoutStatus.FAILED,
        settledAt: status === 'settled' ? new Date() : null,
        failureReason:
          status === 'failed'
            ? (body?.data?.complete_message ?? 'Transfer failed')
            : null,
      },
    });

    this.logger.log(`Payout ref ${disbursementRef}: ${status}`);
  }

  // ─── Admin read endpoints ──────────────────────────────────────────────────

  async listPayouts(filters: {
    status?: PayoutStatus;
    processor?: string;
    schoolId?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, processor, schoolId, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (processor) where.processor = processor;
    if (schoolId) where.schoolId = schoolId;

    const [records, total] = await Promise.all([
      this.prisma.platformPayout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          transaction: { select: { reference: true, amount: true } },
          school: { select: { name: true } },
        },
      }),
      this.prisma.platformPayout.count({ where }),
    ]);

    const summary = await this.prisma.platformPayout.groupBy({
      by: ['status'],
      where,
      _sum: { platformAmountKobo: true },
      _count: true,
    });

    return {
      records: records.map((r) => ({
        ...r,
        platformAmountNaira: r.platformAmountKobo / 100,
        transaction: {
          ...r.transaction,
          amount: Number(r.transaction.amount),
        },
      })),
      summary: summary.map((s) => ({
        status: s.status,
        count: s._count,
        totalNaira: (s._sum.platformAmountKobo ?? 0) / 100,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // Retry a failed payout
  async retryPayout(id: string): Promise<void> {
    const payout = await this.prisma.platformPayout.findUnique({
      where: { id },
    });
    if (!payout) throw new NotFoundException('Payout record not found');
    if (payout.status !== PayoutStatus.FAILED) {
      throw new BadRequestException('Only FAILED payouts can be retried');
    }

    await this.prisma.platformPayout.update({
      where: { id },
      data: {
        status: PayoutStatus.PENDING,
        failureReason: null,
        disbursementReference: null,
      },
    });

    // Trigger sweep immediately for this single payout
    await this.sweepPendingPayouts();
  }

  // ─── Private: processor transfer APIs ─────────────────────────────────────

  private supportsNativeSplit(processor: string): boolean {
    // Paystack and Flutterwave handle splits natively via subaccounts.
    // Korapay does NOT — we must manually transfer platform earnings to ourselves.
    return processor === 'paystack' || processor === 'flutterwave';
  }

  private async initiateTransfer(
    processor: string,
    amountKobo: number,
    payoutIds: string[],
  ): Promise<string> {
    if (processor === 'korapay') {
      return this.korapayTransfer(amountKobo, payoutIds);
    }
    // Future: add other processors that might not support splits
    throw new Error(`No manual transfer method for processor: ${processor}`);
  }

  private async korapayTransfer(
    amountKobo: number,
    payoutIds: string[],
  ): Promise<string> {
    const secretKey = this.config.get<string>('KORAPAY_SECRET_KEY');
    const bankCode = this.config.get<string>('PLATFORM_BANK_CODE'); // e.g. '058' for GTB
    const accountNo = this.config.get<string>('PLATFORM_ACCOUNT_NUMBER');
    const accountName = this.config.get<string>('PLATFORM_ACCOUNT_NAME');

    if (!bankCode || !accountNo) {
      throw new Error(
        'Platform bank details not configured in env (PLATFORM_BANK_CODE, PLATFORM_ACCOUNT_NUMBER)',
      );
    }

    const reference = `PLT-${Date.now()}-${payoutIds.length}`;

    const payload = {
      reference,
      destination: {
        type: 'bank_account',
        amount: amountKobo / 100,
        currency: 'NGN',
        bank_account: {
          bank: bankCode,
          account: accountNo,
        },
        customer: {
          name: accountName ?? 'Platform Payout',
          email:
            this.config.get<string>('PLATFORM_EMAIL') ??
            'finance@yourplatform.com',
        },
      },
      description: `Platform charges for ${payoutIds.length} transaction(s)`,
    };

    const response = await axios.post(
      'https://api.korapay.com/merchant/api/v1/transactions/disburse',
      payload,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.data.status) {
      throw new Error(`Korapay transfer failed: ${response.data.message}`);
    }

    return response.data.data.reference ?? reference;
  }
}
