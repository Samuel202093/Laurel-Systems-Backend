import { Module } from '@nestjs/common';
import { PlatformPayoutService } from './platform-payout.service';
import { PlatformPayoutController } from './platform-payout.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PlatformPayoutService],
  controllers: [PlatformPayoutController],
  exports: [PlatformPayoutService],
})
export class PlatformPayoutModule {}
