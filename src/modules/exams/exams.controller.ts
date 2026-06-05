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
  UseGuards,
  Req,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { ApproveExamDto } from './dto/approve-exam.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * Roles that can manage (view/edit/delete) exam questions and attempts.
 * Includes both direct role values AND sub-role values so the RolesGuard
 * matches regardless of which field carries the permission.
 */
const ADMIN_EXAM_ROLES = [
  'SCHOOL_ADMIN',   // direct role — covers all SCHOOL_ADMIN users
  'TEACHER',
  'PRINCIPAL',
  'ICT_ADMIN',
  'SCHOOL_OWNER',
  'DIRECTOR',
  'SUB_ADMIN',
] as const;

@ApiTags('Exams')
@ApiBearerAuth()
@Controller('exams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  // ════════════════════════════════════════════════════════════════════════════
  //  CREATE / READ / UPDATE / DELETE — EXAMS
  // ════════════════════════════════════════════════════════════════════════════

  /** Upload a new exam with optional question images */
  @Post('upload')
  @Roles('TEACHER')
  @UseInterceptors(FilesInterceptor('images'))
  @ApiOperation({ summary: 'Teacher creates a new exam with questions (supports image uploads)' })
  @ApiResponse({ status: 201, description: 'Exam created successfully' })
  async uploadExam(
    @Body('payload') payload: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const dto = JSON.parse(payload) as CreateExamDto;
    return this.examsService.createExam(dto, files);
  }

  /** Fetch all exams created by a specific teacher (lightweight — no full question bodies) */
  @Get('teacher/:teacherId')
  @Roles(...ADMIN_EXAM_ROLES)
  @ApiOperation({
    summary: "Get all exams created by a teacher (list view — no full question bodies)",
    description: "Returns exam metadata and counts only. Use GET /exams/:id to retrieve full questions.",
  })
  @ApiParam({ name: 'teacherId', description: 'Teacher UUID' })
  async getTeacherExams(@Param('teacherId') teacherId: string) {
    return this.examsService.getExamsByTeacher(teacherId);
  }

  /** School-admin view: all exams for a school (lightweight — no full question bodies) */
  @Get('school/:schoolId')
  @Roles('SCHOOL_ADMIN', 'PRINCIPAL', 'ICT_ADMIN', 'SCHOOL_OWNER', 'DIRECTOR', 'SUB_ADMIN')
  @ApiOperation({
    summary: 'Get all exams for a school (admin only, list view — no full question bodies)',
    description: "Returns exam metadata and counts. Use GET /exams/:id for full question details.",
  })
  @ApiParam({ name: 'schoolId', description: 'School UUID' })
  async getSchoolExams(@Param('schoolId') schoolId: string) {
    return this.examsService.getExamsBySchool(schoolId);
  }

  /** Students filter exams by class/subject */
  @Get('student/filter')
  @Roles('STUDENT', ...ADMIN_EXAM_ROLES)
  @ApiOperation({ summary: 'Get approved exams for a class/subject (student view)' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'subjectId', required: true })
  @ApiQuery({ name: 'schoolId', required: true })
  @ApiQuery({ name: 'term', required: false })
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

  /** Get a single exam with all its questions */
  @Get(':id')
  @Roles('STUDENT', ...ADMIN_EXAM_ROLES)
  @ApiOperation({ summary: 'Get exam detail with full questions' })
  @ApiParam({ name: 'id', description: 'Exam UUID' })
  async getExam(@Param('id') id: string) {
    return this.examsService.getExamWithQuestions(id);
  }

  /** Update exam metadata (teacher owner or admin) */
  @Patch(':id')
  @Roles(...ADMIN_EXAM_ROLES)
  @ApiOperation({ summary: 'Update exam metadata (teacher or admin)' })
  @ApiParam({ name: 'id', description: 'Exam UUID' })
  async updateExam(
    @Param('id') id: string,
    @Body() updates: any,
    @Req() req: any,
  ) {
    return this.examsService.updateExam(id, updates, req.user);
  }

  /** Delete an exam (teacher owner or admin; approved exams are protected) */
  @Delete(':id')
  @Roles(...ADMIN_EXAM_ROLES)
  @ApiOperation({ summary: 'Delete an exam and all its Cloudinary images (teacher or admin)' })
  @ApiParam({ name: 'id', description: 'Exam UUID' })
  async deleteExam(@Param('id') id: string, @Req() req: any) {
    return this.examsService.deleteExam(id, req.user);
  }

  /** Approve or reject an exam */
  @Patch(':id/approve')
  @Roles('SCHOOL_ADMIN', 'PRINCIPAL', 'ICT_ADMIN', 'SCHOOL_OWNER', 'DIRECTOR', 'TEACHER')
  @ApiOperation({ summary: 'Approve or reject an exam (principal, ICT admin, director, form-teacher)' })
  @ApiParam({ name: 'id', description: 'Exam UUID' })
  async approveExam(
    @Param('id') id: string,
    @Body() dto: ApproveExamDto,
    @Req() req: any,
  ) {
    return this.examsService.approveExam(id, req.user, dto);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  QUESTIONS — view / edit / delete
  //  Accessible by: teacher owner + SCHOOL_ADMIN + DIRECTOR + ICT_ADMIN + all admin roles
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * GET /exams/:examId/questions
   * Returns the full exam with all questions (including correct answers).
   * Accessible by: the teacher who created the exam, OR any school-admin role
   * (SCHOOL_ADMIN, DIRECTOR, ICT_ADMIN, PRINCIPAL, SCHOOL_OWNER, SUB_ADMIN).
   */
  @Get(':examId/questions')
  @Roles(...ADMIN_EXAM_ROLES)
  @ApiOperation({
    summary: 'View all questions for an exam (teacher owner or admin)',
    description:
      'Returns the full exam with questions, including correct answers. ' +
      'Accessible by the teacher who created the exam, or any school-admin ' +
      '(SCHOOL_ADMIN, DIRECTOR, ICT_ADMIN, PRINCIPAL, SCHOOL_OWNER, SUB_ADMIN).',
  })
  @ApiParam({ name: 'examId', description: 'Exam UUID' })
  @ApiResponse({ status: 200, description: 'Exam with questions returned' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the exam owner or admin' })
  async getExamQuestions(@Param('examId') examId: string, @Req() req: any) {
    return this.examsService.getExamQuestions(examId, req.user);
  }

  /**
   * PATCH /exams/:examId/questions/:questionId
   * Edit a question's text, options, marks, or image.
   * Accessible by: teacher owner, SCHOOL_ADMIN, DIRECTOR, ICT_ADMIN, and other admin roles.
   */
  @Patch(':examId/questions/:questionId')
  @Roles(...ADMIN_EXAM_ROLES)
  @UseInterceptors(FileInterceptor('image'))
  @ApiOperation({
    summary: 'Edit a question — teacher owner or admin (SCHOOL_ADMIN, DIRECTOR, ICT_ADMIN)',
  })
  @ApiParam({ name: 'examId', description: 'Exam UUID' })
  @ApiParam({ name: 'questionId', description: 'Question UUID' })
  async updateQuestion(
    @Param('examId') examId: string,
    @Param('questionId') questionId: string,
    @Body() updates: any,
    @Req() req: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }), // 5 MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
        ],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ) {
    const parsedUpdates = typeof updates === 'string' ? JSON.parse(updates) : updates;
    return this.examsService.updateQuestion(examId, questionId, parsedUpdates, req.user, file);
  }

  /**
   * DELETE /exams/:examId/questions/:questionId
   * Delete a question and its Cloudinary assets (question image + option images in parallel).
   * Accessible by: teacher owner, SCHOOL_ADMIN, DIRECTOR, ICT_ADMIN, and other admin roles.
   */
  @Delete(':examId/questions/:questionId')
  @Roles(...ADMIN_EXAM_ROLES)
  @ApiOperation({
    summary: 'Delete a question and its Cloudinary image — teacher owner or admin (SCHOOL_ADMIN, DIRECTOR, ICT_ADMIN)',
  })
  @ApiParam({ name: 'examId', description: 'Exam UUID' })
  @ApiParam({ name: 'questionId', description: 'Question UUID' })
  async deleteQuestion(
    @Param('examId') examId: string,
    @Param('questionId') questionId: string,
    @Req() req: any,
  ) {
    return this.examsService.deleteQuestion(examId, questionId, req.user);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  EXAM ATTEMPTS — view / edit / delete  (teacher + all admin roles)
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * GET /exams/:examId/attempts
   * Returns all student attempt records with scores, ranks, percentages, and a class summary.
   */
  @Get(':examId/attempts')
  @Roles(...ADMIN_EXAM_ROLES)
  @ApiOperation({
    summary: 'Get all student attempts for an exam — teacher or admin',
    description:
      'Returns every student attempt record with score, rank, percentage, and a class-level summary ' +
      '(average score, highest, lowest). Only the exam owner or a school-admin can access this.',
  })
  @ApiParam({ name: 'examId', description: 'Exam UUID' })
  async getExamAttempts(@Param('examId') examId: string, @Req() req: any) {
    return this.examsService.getExamAttempts(examId, req.user);
  }

  /**
   * PATCH /exams/:examId/attempts/:attemptId
   * Override a student's score or add a remark. Status cannot be changed via this endpoint.
   */
  @Patch(':examId/attempts/:attemptId')
  @Roles(...ADMIN_EXAM_ROLES)
  @ApiOperation({
    summary: 'Override score or add remark on a student attempt — teacher or admin',
    description: 'Allowed fields: `score` (number), `remark` (string). Status cannot be changed via this endpoint.',
  })
  @ApiParam({ name: 'examId', description: 'Exam UUID' })
  @ApiParam({ name: 'attemptId', description: 'ExamAttempt UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        score: { type: 'number', example: 85 },
        remark: { type: 'string', example: 'Excellent performance' },
      },
    },
  })
  async updateExamAttempt(
    @Param('examId') examId: string,
    @Param('attemptId') attemptId: string,
    @Body() updates: any,
    @Req() req: any,
  ) {
    return this.examsService.updateExamAttempt(examId, attemptId, updates, req.user);
  }

  /**
   * DELETE /exams/:examId/attempts/:attemptId
   * Remove a student attempt record (e.g., malpractice reset).
   */
  @Delete(':examId/attempts/:attemptId')
  @Roles(...ADMIN_EXAM_ROLES)
  @ApiOperation({ summary: 'Delete a student exam attempt — teacher or admin' })
  @ApiParam({ name: 'examId', description: 'Exam UUID' })
  @ApiParam({ name: 'attemptId', description: 'ExamAttempt UUID' })
  async deleteExamAttempt(
    @Param('examId') examId: string,
    @Param('attemptId') attemptId: string,
    @Req() req: any,
  ) {
    return this.examsService.deleteExamAttempt(examId, attemptId, req.user);
  }

  /**
   * POST /exams/:examId/notify-teacher
   * Manually trigger a compiled results email to the exam's teacher.
   * Bypasses the automatic debounce — always sends a fresh email.
   */
  @Post(':examId/notify-teacher')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_EXAM_ROLES)
  @ApiOperation({
    summary: 'Send compiled class exam results to the teacher by email (manual trigger)',
    description:
      'Compiles all SUBMITTED attempts for the exam and emails the teacher a ranked result table. ' +
      'An automatic debounced email is sent after student submissions; this endpoint forces an immediate re-send. ' +
      'Useful after the exam window closes or when the teacher needs an updated summary.',
  })
  @ApiParam({ name: 'examId', description: 'Exam UUID' })
  @ApiResponse({ status: 200, description: 'Email dispatched to teacher' })
  @ApiResponse({ status: 400, description: 'No submitted attempts / teacher email not set' })
  async notifyTeacher(@Param('examId') examId: string, @Req() req: any) {
    return this.examsService.sendExamResultsToTeacher(examId, req.user);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  STUDENT ACTIONS
  // ════════════════════════════════════════════════════════════════════════════

  @Post(':id/verify-key/:schoolId/:classId')
  @Roles('STUDENT', ...ADMIN_EXAM_ROLES)
  @ApiOperation({ summary: 'Verify an exam access key before starting' })
  @ApiParam({ name: 'id', description: 'Exam UUID' })
  @ApiParam({ name: 'schoolId', description: 'School UUID' })
  @ApiParam({ name: 'classId', description: 'Class UUID' })
  async verifyExamKey(
    @Param('id') id: string,
    @Param('schoolId') schoolId: string,
    @Param('classId') classId: string,
    @Body('examKey') examKey: string,
  ) {
    return this.examsService.verifyExamKey(id, examKey, schoolId, classId);
  }

  @Post(':id/start')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Student starts an exam — creates an IN_PROGRESS attempt' })
  @ApiParam({ name: 'id', description: 'Exam UUID' })
  async startExam(@Param('id') id: string, @Req() req: any) {
    return this.examsService.startExam(id, req.user.sub);
  }

  @Post(':id/submit')
  @Roles('STUDENT')
  @ApiOperation({
    summary: 'Student submits answers — auto-graded; teacher receives a debounced compiled results email',
    description:
      'Grades answers immediately, persists the score, and triggers a debounced teacher notification ' +
      '(at most once every 5 minutes per exam). Response includes score, total marks, percentage, and school name.',
  })
  @ApiParam({ name: 'id', description: 'Exam UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        answers: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Map of questionId → selected answer label',
          example: { 'question-uuid-1': 'A', 'question-uuid-2': 'C' },
        },
      },
    },
  })
  async submitExam(
    @Param('id') id: string,
    @Body('answers') answers: Record<string, string>,
    @Req() req: any,
  ) {
    return this.examsService.submitExam(id, req.user.sub, answers);
  }
}
