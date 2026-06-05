import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SchoolsModule } from './modules/schools/schools.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClassesModule } from './modules/classes/classes.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { StudentsModule } from './modules/students/students.module';
import { MailModule } from './modules/mail/mail.module';
import { BankAccountsModule } from './modules/bank-accounts/bank-accounts.module';
import { SubjectsModule } from './modules/subjects/subjects.module';
import { GradingModule } from './modules/grading/grading.module';
import { CloudinaryModule } from './modules/cloudinary/cloudinary.module';
import { ResultsModule } from './modules/results/results.module';
import { IdempotencyMiddleware } from './common/middleware/idempotency.middleware';
import { ExamsModule } from './modules/exams/exams.module';
// import { R2Module } from './modules/r2/r2.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { FeesModule } from './modules/fees/fees.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PlatformConfigModule } from './modules/platform-config/platform-config.module';
import { PlatformPayoutModule } from './modules/platform-payout/platform-payout.module';
import { CommunicationModule } from './modules/communication/communication.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    SchoolsModule,
    ClassesModule,
    TeachersModule,
    StudentsModule,
    MailModule,
    BankAccountsModule,
    SubjectsModule,
    GradingModule,
    CloudinaryModule,
    ResultsModule,
    ExamsModule,
    // R2Module,
    AssignmentsModule,
    FeesModule,
    PaymentsModule,
    PlatformConfigModule,
    PlatformPayoutModule,
    CommunicationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(IdempotencyMiddleware)
      .forRoutes(
        { path: '*path', method: RequestMethod.POST },
        { path: '*path', method: RequestMethod.PATCH },
        { path: '*path', method: RequestMethod.PUT },
      );
  }
}
