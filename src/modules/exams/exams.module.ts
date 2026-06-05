import { Module } from '@nestjs/common';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
// MailModule is @Global() so MailService is injected automatically.
// Listing it here explicitly documents the dependency clearly.
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [CloudinaryModule, PrismaModule, AuthModule, MailModule],
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
