import { Module } from '@nestjs/common';
import { SchoolsService } from './schools.service';
import { SchoolsController } from './schools.controller';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';

@Module({
  imports: [AuthModule, ClassesModule],
  providers: [SchoolsService],
  controllers: [SchoolsController],
})
export class SchoolsModule {}
