import { Module } from '@nestjs/common';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CloudinaryModule, PrismaModule, AuthModule],
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
