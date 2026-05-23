import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFiles,
  Get,
  Param,
  Delete,
  Patch,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  HttpStatus,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { ApproveExamDto } from './dto/approve-exam.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post('upload')
  @UseInterceptors(FilesInterceptor('images'))
  async uploadExam(
    @Body('payload') payload: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const dto = JSON.parse(payload) as CreateExamDto;
    return this.examsService.createExam(dto, files);
  }

  @Get('teacher/:teacherId')
  async getTeacherExams(@Param('teacherId') teacherId: string) {
    return this.examsService.getExamsByTeacher(teacherId);
  }

  @Get('school/:schoolId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PRINCIPAL', 'ICT_ADMIN', 'SCHOOL_OWNER', 'DIRECTOR', 'SUB_ADMIN')
  async getSchoolExams(@Param('schoolId') schoolId: string) {
    return this.examsService.getExamsBySchool(schoolId);
  }

  @Get('student/filter')
  @UseGuards(JwtAuthGuard)
  async getExamsByClassAndSubject(
    @Query('classId') classId: string,
    @Query('subjectId') subjectId: string,
    @Query('schoolId') schoolId: string,
    @Query('term') term?: string,
    @Req() req?: any,
  ) {
    const studentId = req?.user?.role === 'STUDENT' ? req.user.sub : undefined;
    return this.examsService.getExamsByClassAndSubject(classId, subjectId, schoolId, term, studentId);
  }

  @Get(':id')
  async getExam(@Param('id') id: string) {
    return this.examsService.getExamWithQuestions(id);
  }

  @Post(':id/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  async startExam(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.examsService.startExam(id, req.user.sub);
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  async submitExam(
    @Param('id') id: string,
    @Body('answers') answers: Record<string, string>,
    @Req() req: any,
  ) {
    return this.examsService.submitExam(id, req.user.sub, answers);
  }

  @Post(':id/verify-key/:schoolId/:classId')
  async verifyExamKey(
    @Param('id') id: string,
    @Param('schoolId') schoolId: string,
    @Param('classId') classId: string,
    @Body('examKey') examKey: string,
  ) {
    return this.examsService.verifyExamKey(id, examKey, schoolId, classId);
  }

  @Patch(':examId/questions/:questionId')
  @UseInterceptors(FileInterceptor('image'))
  async updateQuestion(
    @Param('examId') examId: string,
    @Param('questionId') questionId: string,
    @Body() updates: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }), // 5MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
        ],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ) {
    // Parse updates if sent as JSON string in FormData
    const parsedUpdates = typeof updates === 'string' ? JSON.parse(updates) : updates;
    return this.examsService.updateQuestion(examId, questionId, parsedUpdates, file);
  }

  @Delete(':examId/questions/:questionId')
  async deleteQuestion(
    @Param('examId') examId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.examsService.deleteQuestion(examId, questionId);
  }

  @Patch(':id')
  async updateExam(
    @Param('id') id: string,
    @Body() updates: any,
  ) {
    return this.examsService.updateExam(id, updates);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PRINCIPAL', 'ICT_ADMIN', 'SCHOOL_OWNER', 'DIRECTOR', 'TEACHER')
  async approveExam(
    @Param('id') id: string,
    @Body() dto: ApproveExamDto,
    @Req() req: any,
  ) {
    return this.examsService.approveExam(id, req.user, dto);
  }
}
