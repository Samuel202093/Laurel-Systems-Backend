// ─── payments.controller.ts ───────────────────────────────────────────────────

import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  Res,
  Req,
  Headers,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { PaymentsService } from './payments.service';
import {
  InitiatePaymentDto,
  VerifyPaymentDto,
} from './dto/initiate-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Payments')
@Controller('payments')
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Initiate a payment — returns paymentUrl for card or virtualAccount for bank transfer',
  })
  async initiate(@Body() dto: InitiatePaymentDto, @Res() res: Response) {
    const data = await this.paymentsService.initiatePayment(dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Payment initiated successfully',
      data,
    });
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Verify a payment — useful for card payments after redirect',
  })
  async verify(@Body() dto: VerifyPaymentDto, @Res() res: Response) {
    const result = await this.paymentsService.verifyPayment(dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message:
        result.status === 'success' ? 'Payment verified' : 'Payment failed',
      data: result,
    });
  }

  @Get('outstanding/:studentId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Get all outstanding fees for a student — use this to build the payment page',
  })
  async getOutstanding(
    @Param('studentId') studentId: string,
    @Res() res: Response,
  ) {
    const data = await this.paymentsService.getStudentOutstanding(studentId);
    return res.status(HttpStatus.OK).json({ statusCode: HttpStatus.OK, data });
  }

  @Get('receipt/:receiptNumber')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get receipt with full fee breakdown including charges',
  })
  async getReceipt(
    @Param('receiptNumber') receiptNumber: string,
    @Res() res: Response,
  ) {
    const data = await this.paymentsService.getReceipt(receiptNumber);
    return res.status(HttpStatus.OK).json({ statusCode: HttpStatus.OK, data });
  }

  @Get('history/:studentId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get paginated payment history for a student' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getHistory(
    @Param('studentId') studentId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Res() res: Response,
  ) {
    const data = await this.paymentsService.getStudentHistory(
      studentId,
      page,
      limit,
    );
    return res.status(HttpStatus.OK).json({ statusCode: HttpStatus.OK, data });
  }

  // ─── Webhook endpoint ───────────────────────────────────────────────────────
  // IMPORTANT: This route must be excluded from NestJS body parsing middleware
  // so we receive the raw Buffer (needed for HMAC signature verification).
  //
  // In main.ts, add:
  //   app.use('/payments/webhook', (req, res, next) => {
  //     let data = Buffer.alloc(0);
  //     req.on('data', chunk => { data = Buffer.concat([data, chunk]); });
  //     req.on('end', () => { req['rawBody'] = data; next(); });
  //   });
  //
  // Or with the global rawBody middleware package: npm i nestjs-raw-body

  @Post('webhook/:processor')
  @ApiOperation({
    summary: 'Webhook endpoint for payment processors — do not call directly',
  })
  async handleWebhook(
    @Param('processor') processor: string,
    @Body() body: any,
    @Req() req: Request,
    @Headers() headers: Record<string, string>,
    @Res() res: Response,
  ) {
    // Always respond 200 immediately — processor retries on anything else.
    // Process asynchronously so the response is not delayed.
    res.status(HttpStatus.OK).send('OK');

    // Process after response is sent (fire-and-forget with error handling inside)
    const rawBody: Buffer =
      (req as any).rawBody ?? Buffer.from(JSON.stringify(body));
    this.paymentsService
      .handleWebhook(processor, body, rawBody, headers)
      .catch((err) => {
        // Error is already logged inside the service — just swallow here
      });
  }
}
