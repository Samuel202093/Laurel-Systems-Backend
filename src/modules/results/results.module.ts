import { Module } from '@nestjs/common';
import { ResultsService } from './results.service';
import { ResultsController } from './results.controller';
import { GradingModule } from '../grading/grading.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [GradingModule, AuthModule],
  controllers: [ResultsController],
  providers: [ResultsService],
  exports: [ResultsService],
})
export class ResultsModule {}
