import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';
import axios from 'axios';
import {
  InitiatePaymentDto,
  PaymentProcessor,
  PaymentChannel,
  VerifyPaymentDto,
} from './dto/initiate-payment.dto';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { PlatformPayoutService } from '../platform-payout/platform-payout.service';

// ─── Money helpers ────────────────────────────────────────

const toKobo = (naira: number) => Math.round(naira * 100);
const fromKobo = (kobo: number) => kobo / 100;

// ─── Gateway fee calculators (all in kobo) ────────────────────────────────────
function paystackFee(amountKobo: number): number {
  const flat = amountKobo > 250_000 ? 10_000 : 0;
  return Math.min(Math.round(amountKobo * 0.015) + flat, 200_000);
}
function flutterwaveFee(amountKobo: number, international = false): number {
  return Math.round(amountKobo * (international ? 0.038 : 0.014));
}
function korapayFee(amountKobo: number): number {
  return Math.min(Math.round(amountKobo * 0.015), 250_000);
}
function bankTransferFee(_amountKobo: number): number {
  return 5_000;
}

function calculateGatewayFee(
  amountKobo: number,
  processor: PaymentProcessor,
  channel: PaymentChannel,
): number {
  if (channel === PaymentChannel.BANK_TRANSFER)
    return bankTransferFee(amountKobo);
  switch (processor) {
    case PaymentProcessor.PAYSTACK:
      return paystackFee(amountKobo);
    case PaymentProcessor.FLUTTERWAVE:
      return flutterwaveFee(amountKobo);
    case PaymentProcessor.KORAPAY:
      return korapayFee(amountKobo);
    default:
      return paystackFee(amountKobo);
  }
}

// ─── Webhook signature verifiers ──────────────────────────────────────────────
function verifyPaystackSig(raw: Buffer, sig: string, secret: string): boolean {
  return crypto.createHmac('sha512', secret).update(raw).digest('hex') === sig;
}
function verifyKorapaySig(raw: Buffer, sig: string, secret: string): boolean {
  return crypto.createHmac('sha256', secret).update(raw).digest('hex') === sig;
}

// ─── Installment calculator ────────────────────────────────────────────
function calcInstallmentKobo(
  fullKobo: number,
  total: number,
  n: number,
): number {
  const base = Math.floor(fullKobo / total);
  const remainder = fullKobo - base * total;
  return n === 1 ? base + remainder : base;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly platformConfig: PlatformConfigService,
    private readonly platformPayout: PlatformPayoutService,
  ) {}

  // ─── Initiate payment ──────────────────────────────────────────────────────

  async initiatePayment(dto: InitiatePaymentDto) {
    const { fees, processor, channel = PaymentChannel.CARD, studentId } = dto;

    // 1. Validate student + load school
    const student = await (this.prisma as any).student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        schoolId: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const school = await (this.prisma as any).school.findUnique({
      where: { id: student.schoolId },
      select: {
        id: true,
        name: true,
        absorbGatewayFee: true,
        paystackSubaccountCode: true,
        flutterwaveSubaccountId: true,
      },
    });

    // 2. Validate fees and compute principal (all in kobo)
    let principalKobo = 0;
    const validatedFees: ValidatedFeeItem[] = [];

    for (const item of fees) {
      const feeConfig = await (this.prisma as any).feeConfiguration.findUnique({
        where: { id: item.feeId, schoolId: student.schoolId },
      });
      if (!feeConfig)
        throw new NotFoundException(`Fee config ${item.feeId} not found`);

      const fullKobo = toKobo(Number(feeConfig.amount));
      const payments = await (this.prisma as any).paymentRecord.findMany({
        where: { feeId: item.feeId, studentId },
        select: { amountKobo: true },
      });
      const paidKobo = payments.reduce(
        (s: number, p: any) => s + (p.amountKobo as number),
        0,
      );

      if (paidKobo >= fullKobo)
        throw new BadRequestException(
          `"${feeConfig.feeName}" is already fully paid`,
        );

      let amountKobo: number;
      let installmentNumber: number | null = null;

      if (item.paymentPlan === 'installments') {
        if (!feeConfig.installments || feeConfig.installments < 2)
          throw new BadRequestException(
            `"${feeConfig.feeName}" does not support installments`,
          );

        const paidCount = await (this.prisma as any).paymentRecord.count({
          where: { feeId: item.feeId, studentId, paymentPlan: 'installments' },
        });
        const currentInstallment = paidCount + 1;
        installmentNumber = currentInstallment;

        if (currentInstallment > feeConfig.installments)
          throw new BadRequestException(
            `All installments for "${feeConfig.feeName}" are paid`,
          );

        amountKobo = Math.min(
          calcInstallmentKobo(
            fullKobo,
            feeConfig.installments,
            currentInstallment,
          ),
          fullKobo - paidKobo,
        );
      } else {
        amountKobo = fullKobo - paidKobo;
      }

      principalKobo += amountKobo;
      validatedFees.push({
        feeId: item.feeId,
        feeName: feeConfig.feeName,
        paymentPlan: item.paymentPlan,
        installmentNumber,
        amountKobo,
      });
    }

    // 3. Calculate all charges via dynamic config
    const gatewayFeeKobo = calculateGatewayFee(
      principalKobo,
      processor,
      channel,
    );
    const absorbGateway = school?.absorbGatewayFee ?? false;

    const breakdown = await this.platformConfig.buildChargeBreakdown(
      principalKobo,
      gatewayFeeKobo,
      student.schoolId,
      absorbGateway,
    );

    // 4. Create pending transaction
    const reference = `TRX-${nanoid(12).toUpperCase()}`;

    const transaction = await (this.prisma as any).transaction.create({
      data: {
        reference,
        amountKobo: breakdown.studentPaysKobo,
        principalKobo: breakdown.principalKobo,
        gatewayFeeKobo: breakdown.gatewayFeeKobo,
        platformFlatKobo: breakdown.platformFlatKobo,
        platformPctKobo: breakdown.platformPercentKobo,
        platformTotalKobo: breakdown.platformTotalKobo,
        processor,
        channel,
        studentId,
        schoolId: student.schoolId,
        status: 'PENDING',
        metadata: {
          fees: validatedFees,
          email: student.email,
          studentName: `${student.firstName} ${student.lastName}`,
          absorbGateway,
          schoolReceivesKobo: breakdown.schoolReceivesKobo,
          paystackSubaccountCode: school?.paystackSubaccountCode ?? null,
          flutterwaveSubaccountId: school?.flutterwaveSubaccountId ?? null,
        },
      },
    });

    // 5. Get payment URL / virtual account from processor
    const processorResponse = await this.getProcessorPaymentUrl(
      transaction,
      student.email ?? '',
      channel,
      {
        paystackSubaccountCode: school?.paystackSubaccountCode ?? null,
        flutterwaveSubaccountId: school?.flutterwaveSubaccountId ?? null,
        platformChargeKobo: breakdown.platformTotalKobo,
        absorbGateway,
      },
    );

    return {
      transactionId: transaction.id,
      reference: transaction.reference,
      channel,
      breakdown: {
        principalNaira: fromKobo(breakdown.principalKobo),
        platformFlatNaira: fromKobo(breakdown.platformFlatKobo),
        platformPercentNaira: fromKobo(breakdown.platformPercentKobo),
        platformTotalNaira: fromKobo(breakdown.platformTotalKobo),
        gatewayFeeNaira: fromKobo(breakdown.gatewayFeeKobo),
        gatewayAbsorbedBySchool: absorbGateway,
        totalStudentPaysNaira: fromKobo(breakdown.studentPaysKobo),
        schoolReceivesNaira: fromKobo(breakdown.schoolReceivesKobo),
      },
      ...processorResponse,
    };
  }

  // ─── Verify payment ────────────────────────────────────────────────────────

  async verifyPayment(dto: VerifyPaymentDto) {
    const { reference, processor } = dto;

    const transaction = await (this.prisma as any).transaction.findUnique({
      where: { reference },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (transaction.status === 'SUCCESSFUL')
      return { status: 'success', message: 'Already verified', transaction };

    const verification = await this.verifyWithProcessor(reference, processor);

    if (verification.status !== 'success') {
      await (this.prisma as any).transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' },
      });
      return { status: 'failed', message: 'Payment verification failed' };
    }

    // Atomic: update transaction + create payment records
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await (tx as any).transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'SUCCESSFUL',
          processorReference: verification.processorReference,
          paidAt: new Date(),
        },
      });

      const metadata = transaction.metadata;
      const records: any[] = [];

      for (const feeItem of metadata.fees as ValidatedFeeItem[]) {
        const record = await (tx as any).paymentRecord.create({
          data: {
            transactionId: transaction.id,
            feeId: feeItem.feeId,
            studentId: transaction.studentId,
            amountKobo: feeItem.amountKobo,
            paymentPlan: feeItem.paymentPlan,
            installmentNumber: feeItem.installmentNumber,
            receiptNumber: `RCP-${nanoid(10).toUpperCase()}`,
          },
        });
        records.push(record);
      }

      return { updated, records };
    });

    // Create payout record OUTSIDE prisma.$transaction
    // A failure here must NOT roll back the payment confirmation
    await this.platformPayout.createPayoutRecord({
      transactionId: transaction.id,
      schoolId: transaction.schoolId,
      processor,
      platformAmountKobo: transaction.platformTotalKobo,
      platformFlatKobo: transaction.platformFlatKobo,
      platformPercentKobo: transaction.platformPctKobo,
      gatewayFeeKobo: transaction.gatewayFeeKobo,
    });

    return {
      status: 'success',
      transaction: result.updated,
      payments: result.records,
    };
  }

  // ─── Webhook handler ───────────────────────────────────────────────────────

  async handleWebhook(
    processor: string,
    body: any,
    rawBody: Buffer,
    headers: Record<string, string>,
  ) {
    this.logger.log(`Webhook: ${processor}`);

    if (!this.verifyWebhookSignature(processor, rawBody, headers)) {
      this.logger.warn(`Invalid signature for ${processor}`);
      return;
    }

    // Route transfer webhooks to payout service
    if (this.isTransferWebhook(processor, body)) {
      await this.platformPayout.handleTransferWebhook(processor, body);
      return;
    }

    // Payment webhook — normalise and process
    let reference: string | undefined;
    let status: 'success' | 'failed' | undefined;

    if (processor === PaymentProcessor.PAYSTACK) {
      reference = body?.data?.reference;
      status = body?.event === 'charge.success' ? 'success' : 'failed';
    } else if (processor === PaymentProcessor.FLUTTERWAVE) {
      reference = body?.data?.tx_ref;
      status = body?.data?.status === 'successful' ? 'success' : 'failed';
    } else if (processor === PaymentProcessor.KORAPAY) {
      reference = body?.data?.reference;
      status = body?.event === 'charge.success' ? 'success' : 'failed';
    }

    if (!reference || !status) {
      this.logger.warn(`Unrecognised payload for ${processor}`);
      return;
    }

    try {
      if (status === 'success') {
        await this.verifyPayment({
          reference,
          processor: processor as PaymentProcessor,
        });
      } else {
        await (this.prisma as any).transaction.updateMany({
          where: { reference, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
      }
    } catch (error) {
      this.logger.error(`Webhook error for ${reference}: ${error.message}`);
    }
  }

  // ─── Read endpoints ────────────────────────────────────────────────────────

  async getReceipt(receiptNumber: string) {
    const r = await (this.prisma as any).paymentRecord.findUnique({
      where: { receiptNumber },
      include: {
        fee: {
          select: { feeName: true, session: true, term: true, amount: true },
        },
        student: {
          select: { firstName: true, lastName: true, registrationNumber: true },
        },
        transaction: {
          select: {
            reference: true,
            processor: true,
            channel: true,
            amountKobo: true,
            principalKobo: true,
            gatewayFeeKobo: true,
            platformTotalKobo: true,
            platformFlatKobo: true,
            platformPctKobo: true,
            paidAt: true,
          },
        },
      },
    });

    if (!r) throw new NotFoundException('Receipt not found');

    return {
      ...r,
      amountNaira: fromKobo(r.amountKobo),
      transaction: {
        ...r.transaction,
        totalNaira: fromKobo(r.transaction.amountKobo),
        principalNaira: fromKobo(r.transaction.principalKobo),
        gatewayFeeNaira: fromKobo(r.transaction.gatewayFeeKobo),
        platformFlatNaira: fromKobo(r.transaction.platformFlatKobo),
        platformPctNaira: fromKobo(r.transaction.platformPctKobo),
        platformTotalNaira: fromKobo(r.transaction.platformTotalKobo),
      },
    };
  }

  async getStudentHistory(studentId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [records, total] = await Promise.all([
      (this.prisma as any).paymentRecord.findMany({
        where: { studentId },
        include: {
          fee: { select: { feeName: true, session: true, term: true } },
          transaction: {
            select: {
              reference: true,
              processor: true,
              channel: true,
              status: true,
              paidAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      (this.prisma as any).paymentRecord.count({ where: { studentId } }),
    ]);

    return {
      records: records.map((r) => ({
        ...r,
        amountNaira: fromKobo(r.amountKobo),
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getStudentOutstanding(studentId: string) {
    const student = await (this.prisma as any).student.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const fees = await (this.prisma as any).feeConfiguration.findMany({
      where: { schoolId: student.schoolId },
    });
    const result: any[] = [];

    for (const fee of fees) {
      const payments = await (this.prisma as any).paymentRecord.findMany({
        where: { feeId: fee.id, studentId },
        select: {
          amountKobo: true,
          installmentNumber: true,
          paymentPlan: true,
        },
      });
      const fullKobo = toKobo(Number(fee.amount));
      const paidKobo = payments.reduce((s, p) => s + p.amountKobo, 0);
      const paidCount = payments.filter(
        (p) => p.paymentPlan === 'installments',
      ).length;

      result.push({
        feeId: fee.id,
        feeName: fee.feeName,
        fullAmountNaira: fromKobo(fullKobo),
        paidNaira: fromKobo(paidKobo),
        outstandingNaira: fromKobo(fullKobo - paidKobo),
        fullyPaid: paidKobo >= fullKobo,
        supportsInstallments: (fee.installments ?? 0) >= 2,
        totalInstallments: fee.installments,
        paidInstallments: paidCount,
        nextInstallmentNumber: paidCount + 1,
      });
    }

    return result;
  }

  // ─── Private: processor initiations ───────────────────────────────────────

  private async getProcessorPaymentUrl(
    transaction: any,
    email: string,
    channel: PaymentChannel,
    split: SplitConfig,
  ): Promise<ProcessorResponse> {
    const meta = transaction.metadata;

    switch (transaction.processor) {
      case PaymentProcessor.PAYSTACK:
        return this.initiatePaystack(
          transaction.reference,
          transaction.amountKobo,
          email,
          channel,
          split,
          meta,
        );
      case PaymentProcessor.FLUTTERWAVE:
        return this.initiateFlutterwave(
          transaction.reference,
          transaction.amountKobo,
          email,
          channel,
          split,
          meta,
        );
      case PaymentProcessor.KORAPAY:
        return this.initiateKorapay(
          transaction.reference,
          transaction.amountKobo,
          email,
          channel,
          meta,
        );
      default:
        throw new BadRequestException(
          `Unsupported processor: ${transaction.processor}`,
        );
    }
  }

  // ── Paystack split ────────────────────────────────────────────────────────
  // transaction_charge = flat kobo that stays in YOUR (main) account = your platform charge
  // The rest goes to the school subaccount automatically.
  // bearer='account'    → your main account absorbs the gateway fee
  // bearer='subaccount' → school subaccount absorbs the gateway fee

  private async initiatePaystack(
    reference: string,
    amountKobo: number,
    email: string,
    channel: PaymentChannel,
    split: SplitConfig,
    metadata?: any,
  ): Promise<ProcessorResponse> {
    const key = this.config.get<string>('PAYSTACK_SECRET_KEY');

    const payload: any = {
      reference,
      amount: amountKobo,
      email,
      channels:
        channel === PaymentChannel.BANK_TRANSFER
          ? ['bank_transfer']
          : ['card', 'bank', 'ussd', 'mobile_money', 'bank_transfer'],
      metadata: {
        custom_fields: [
          {
            display_name: 'Student',
            variable_name: 'student',
            value: metadata?.studentName,
          },
        ],
      },
    };

    if (split.paystackSubaccountCode) {
      payload.subaccount = split.paystackSubaccountCode;
      payload.transaction_charge = split.platformChargeKobo; // your cut in kobo
      payload.bearer = split.absorbGateway ? 'account' : 'subaccount';
    }

    const res = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      payload,
      {
        headers: { Authorization: `Bearer ${key}` },
      },
    );
    if (!res.data.status)
      throw new InternalServerErrorException('Paystack init failed');

    const data = res.data.data;
    return {
      paymentType:
        channel === PaymentChannel.BANK_TRANSFER ? 'bank_transfer' : 'card',
      paymentUrl: data.authorization_url,
      accessCode: data.access_code,
      ...(channel === PaymentChannel.BANK_TRANSFER && {
        virtualAccount: {
          bankName: data.bank ?? 'Wema Bank',
          accountNumber: data.account_number,
          accountName: data.account_name ?? 'School Fees',
          amount: amountKobo / 100,
          expiresAt: data.expires_at,
        },
      }),
    };
  }

  // ── Flutterwave split ─────────────────────────────────────────────────────
  // subaccounts[].transaction_charge = naira amount the school receives (flat split)
  // Your main account automatically retains the remainder (your platform charge).

  private async initiateFlutterwave(
    reference: string,
    amountKobo: number,
    email: string,
    channel: PaymentChannel,
    split: SplitConfig,
    metadata?: any,
  ): Promise<ProcessorResponse> {
    const key = this.config.get<string>('FLUTTERWAVE_SECRET_KEY');

    const payload: any = {
      tx_ref: reference,
      amount: amountKobo / 100,
      currency: 'NGN',
      redirect_url: this.config.get<string>('PAYMENT_REDIRECT_URL'),
      customer: { email, name: metadata?.studentName },
      meta: { consumer_id: metadata?.studentId },
    };

    if (channel === PaymentChannel.BANK_TRANSFER) {
      payload.payment_options = 'banktransfer';
    }

    if (split.flutterwaveSubaccountId) {
      const schoolAmountNaira = (amountKobo - split.platformChargeKobo) / 100;
      payload.subaccounts = [
        {
          id: split.flutterwaveSubaccountId,
          transaction_charge_type: 'flat',
          transaction_charge: schoolAmountNaira,
        },
      ];
    }

    const res = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: { Authorization: `Bearer ${key}` },
      },
    );
    if (res.data.status !== 'success')
      throw new InternalServerErrorException('Flutterwave init failed');

    return {
      paymentType:
        channel === PaymentChannel.BANK_TRANSFER ? 'bank_transfer' : 'card',
      paymentUrl: res.data.data.link,
    };
  }

  // ── Korapay (no native split — manual payout handles platform charge) ──────

  private async initiateKorapay(
    reference: string,
    amountKobo: number,
    email: string,
    channel: PaymentChannel,
    metadata?: any,
  ): Promise<ProcessorResponse> {
    const key = this.config.get<string>('KORAPAY_SECRET_KEY');

    const payload: any = {
      reference,
      amount: amountKobo / 100,
      currency: 'NGN',
      customer: { email, name: metadata?.studentName },
      notification_url: `${this.config.get('APP_URL')}/payments/webhook/korapay`,
    };

    if (channel === PaymentChannel.BANK_TRANSFER) {
      const res = await axios.post(
        'https://api.korapay.com/merchant/api/v1/virtual-bank-account',
        payload,
        { headers: { Authorization: `Bearer ${key}` } },
      );
      const d = res.data.data;
      return {
        paymentType: 'bank_transfer',
        paymentUrl: null,
        virtualAccount: {
          bankName: d.bank_name,
          accountNumber: d.account_number,
          accountName: d.account_name,
          amount: amountKobo / 100,
        },
      };
    }

    const res = await axios.post(
      'https://api.korapay.com/merchant/api/v1/charges/initialize',
      payload,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    return { paymentType: 'card', paymentUrl: res.data.data.checkout_url };
  }

  // ─── Private: verify with processor ───────────────────────────────────────

  private async verifyWithProcessor(
    reference: string,
    processor: PaymentProcessor,
  ) {
    try {
      if (processor === PaymentProcessor.PAYSTACK) {
        const key = this.config.get<string>('PAYSTACK_SECRET_KEY');
        const res = await axios.get(
          `https://api.paystack.co/transaction/verify/${reference}`,
          { headers: { Authorization: `Bearer ${key}` } },
        );
        const d = res.data.data;
        return {
          status:
            d.status === 'success' ? ('success' as const) : ('failed' as const),
          processorReference: d.id?.toString() ?? reference,
        };
      }
      if (processor === PaymentProcessor.FLUTTERWAVE) {
        const key = this.config.get<string>('FLUTTERWAVE_SECRET_KEY');
        const res = await axios.get(
          `https://api.flutterwave.com/v3/transactions?tx_ref=${reference}`,
          { headers: { Authorization: `Bearer ${key}` } },
        );
        const tx = res.data.data?.[0];
        return {
          status:
            tx?.status === 'successful'
              ? ('success' as const)
              : ('failed' as const),
          processorReference: tx?.id?.toString() ?? reference,
        };
      }
      if (processor === PaymentProcessor.KORAPAY) {
        const key = this.config.get<string>('KORAPAY_SECRET_KEY');
        const res = await axios.get(
          `https://api.korapay.com/merchant/api/v1/charges/${reference}`,
          { headers: { Authorization: `Bearer ${key}` } },
        );
        const d = res.data.data;
        return {
          status:
            d.status === 'success' ? ('success' as const) : ('failed' as const),
          processorReference: d.payment_reference ?? reference,
        };
      }
    } catch (e) {
      this.logger.error(`Verify error: ${e.message}`);
    }
    return { status: 'failed' as const, processorReference: reference };
  }

  private verifyWebhookSignature(
    processor: string,
    raw: Buffer,
    headers: Record<string, string>,
  ): boolean {
    try {
      if (processor === PaymentProcessor.PAYSTACK)
        return verifyPaystackSig(
          raw,
          headers['x-paystack-signature'],
          this.config.get('PAYSTACK_SECRET_KEY')!,
        );
      if (processor === PaymentProcessor.FLUTTERWAVE)
        return (
          headers['verif-hash'] === this.config.get('FLUTTERWAVE_WEBHOOK_HASH')
        );
      if (processor === PaymentProcessor.KORAPAY)
        return verifyKorapaySig(
          raw,
          headers['x-korapay-signature'],
          this.config.get('KORAPAY_ENCRYPTION_KEY')!,
        );
    } catch {
      return false;
    }
    return false;
  }

  private isTransferWebhook(processor: string, body: any): boolean {
    if (processor === 'korapay') return body?.event?.startsWith('transfer.');
    if (processor === 'paystack') return body?.event?.startsWith('transfer.');
    return false;
  }
}

// ─── Local types ──────────────────────────────────────────────────────────────

interface ValidatedFeeItem {
  feeId: string;
  feeName: string;
  paymentPlan: 'full' | 'installments';
  installmentNumber: number | null;
  amountKobo: number;
}

interface SplitConfig {
  paystackSubaccountCode: string | null;
  flutterwaveSubaccountId: string | null;
  platformChargeKobo: number;
  absorbGateway: boolean;
}

interface ProcessorResponse {
  paymentType: 'card' | 'bank_transfer';
  paymentUrl: string | null;
  accessCode?: string;
  virtualAccount?: {
    bankName: string;
    accountNumber: string;
    accountName: string;
    amount: number;
    expiresAt?: string;
  };
}
