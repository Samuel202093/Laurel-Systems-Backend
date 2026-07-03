import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { PlatformPayoutService } from './platform-payout.service';
import { PayoutStatus } from './types';

@ApiTags('Platform Payouts (super-admin)')
@Controller('admin/platform-payouts')
@ApiBearerAuth()
export class PlatformPayoutController {
  constructor(private readonly svc: PlatformPayoutService) {}

  @Get()
  @ApiOperation({
    summary: 'List payout records with filters and totals summary',
  })
  @ApiQuery({ name: 'status', enum: PayoutStatus, required: false })
  @ApiQuery({ name: 'processor', required: false })
  @ApiQuery({ name: 'schoolId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('status') status: PayoutStatus | undefined,
    @Query('processor') processor: string | undefined,
    @Query('schoolId') schoolId: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.svc.listPayouts({
      status,
      processor,
      schoolId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return res.status(HttpStatus.OK).json({ statusCode: 200, data });
  }

  @Post('sweep')
  @ApiOperation({
    summary: 'Manually trigger the payout sweep (normally runs at 2 AM daily)',
    description:
      'Sweeps all PENDING Korapay payouts and initiates bank transfers to your platform account.',
  })
  async sweep(@Res() res: Response) {
    const result = await this.svc.sweepPendingPayouts();
    return res.status(HttpStatus.OK).json({
      statusCode: 200,
      message: `Sweep complete: ${result.swept} swept, ${result.failed} failed`,
      data: { ...result, totalNaira: result.totalKobo / 100 },
    });
  }

  @Post(':id/retry')
  @ApiOperation({
    summary: 'Retry a FAILED payout — re-queues it and triggers a sweep',
  })
  async retry(@Param('id') id: string, @Res() res: Response) {
    await this.svc.retryPayout(id);
    return res.status(HttpStatus.OK).json({
      statusCode: 200,
      message: 'Payout re-queued and sweep triggered',
    });
  }
}
