import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { SubjectsController } from './subjects.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { IdempotencyMiddleware } from '../../common/middleware/idempotency.middleware';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SubjectsController],
  providers: [SubjectsService, PrismaService],
  exports: [SubjectsService],
})
export class SubjectsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(IdempotencyMiddleware)
      .forRoutes(
        { path: 'subjects/:schoolId', method: RequestMethod.POST },
        { path: 'subjects/:id', method: RequestMethod.PATCH },
      );
  }
}
