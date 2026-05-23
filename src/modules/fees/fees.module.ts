import { Module } from '@nestjs/common';
import { FeesService } from './fees.service';
import { JwtModule } from '@nestjs/jwt';
import { FeesController } from './fees.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [JwtModule, PrismaModule],
  // imports: [PrismaModule],
  controllers: [FeesController],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
