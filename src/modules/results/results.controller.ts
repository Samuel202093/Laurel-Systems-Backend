import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  HttpStatus,
  Res,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ResultsService } from './results.service';
import { UploadResultDto } from './dto/upload-result.dto';
import { ApproveResultDto } from './dto/approve-result.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

// ─── Helper: build a uniform JSON envelope with school name at top level ───────
/**
 * Promotes `schoolName` from the nested `data.schoolInfo.name` (or `data.school.name`)
 * to the top level of the response, and prepends it to the human-readable message.
 * This ensures the school's name is always immediately visible in every API response.
 */
function envelope(
  res: Response,
  status: HttpStatus,
  message: string,
  data: any,
) {
  const schoolName: string | undefined =
    data?.schoolInfo?.name ?? data?.school?.name ?? undefined;

  const finalMessage = schoolName ? `${schoolName} — ${message}` : message;

  return res.status(status).json({
    statusCode: status,
    ...(schoolName ? { schoolName } : {}),
    message: finalMessage,
    data,
  });
}

/** Extract and de-duplicate roles from the JWT payload (handles role/subRole/roles fields). */
function extractRoles(user: any): string[] {
  const rawRoles = user.roles;
  const fromPayload = Array.isArray(rawRoles)
    ? rawRoles
    : typeof rawRoles === 'string'
      ? [rawRoles]
      : [];

  return Array.from(
    new Set([
      ...fromPayload,
      ...(user.role ? [user.role] : []),
      ...(user.subRole ? [user.subRole] : []),
    ]),
  );
}

@ApiTags('Results')
@ApiBearerAuth()
@Controller('results/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  // ─── Unified Search Results (Dynamic Permissions) ──────────────────
  @Get()
  @Roles(
    'TEACHER',
    'SCHOOL_ADMIN',
    'ICT_ADMIN',
    'DIRECTOR',
    'PRINCIPAL',
    'SCHOOL_OWNER',
    'SCHOOL_ADMIN',
  )
  @ApiOperation({
    summary:
      'Search results with dynamic permissions (Teacher: own subjects/form-arm, Admin: all)',
  })
  async getResults(
    @Param('schoolId') schoolId: string,
    @Query() filters: any,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user.sub || req.user.id;
    const roles = extractRoles(req.user);
    const data = await this.resultsService.getResults(
      schoolId,
      userId,
      roles,
      filters,
    );
    return envelope(
      res,
      HttpStatus.OK,
      'Results retrieved successfully.',
      data,
    );
  }

  // ─── Get Single Result Detail ──────────────────────────────────────
  @Get(':resultId')
  @Roles(
    'TEACHER',
    'SCHOOL_ADMIN',
    'ICT_ADMIN',
    'DIRECTOR',
    'PRINCIPAL',
    'SCHOOL_OWNER',
    'SCHOOL_ADMIN',
  )
  @ApiOperation({
    summary: 'Retrieve single result detail (with permission checks)',
  })
  async getResultDetail(
    @Param('schoolId') schoolId: string,
    @Param('resultId') resultId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user.sub || req.user.id;
    const roles = extractRoles(req.user);
    const data = await this.resultsService.getResultDetail(
      schoolId,
      resultId,
      userId,
      roles,
    );
    return envelope(
      res,
      HttpStatus.OK,
      'Result details retrieved successfully.',
      data,
    );
  }

  // ─── Teacher uploads / re-uploads results for a subject ─────────────
  @Post('upload')
  @Roles(
    'TEACHER',
    'SCHOOL_ADMIN',
    'ICT_ADMIN',
    'DIRECTOR',
    'PRINCIPAL',
    'SCHOOL_OWNER',
  )
  @ApiOperation({
    summary: 'Upload or update results for a specific class, arm, and subject',
  })
  @ApiParam({ name: 'schoolId', description: 'The unique ID of the school' })
  async uploadResults(
    @Param('schoolId') schoolId: string,
    @Body() dto: UploadResultDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const teacherId = req.user.sub || req.user.id;
    const data = await this.resultsService.uploadResults(
      schoolId,
      teacherId,
      dto,
    );

    const message = data.isUpdate
      ? 'Results updated successfully and awaiting re-approval.'
      : 'Results uploaded successfully and awaiting approval.';

    return envelope(
      res,
      data.isUpdate ? HttpStatus.OK : HttpStatus.CREATED,
      message,
      data,
    );
  }

  // ─── Admin: Approve or reject a result ──────────────────────────────
  @Patch(':resultId/approve')
  @Roles('SCHOOL_ADMIN', 'ICT_ADMIN', 'DIRECTOR', 'PRINCIPAL', 'SCHOOL_OWNER')
  @ApiOperation({ summary: 'Approve or Reject a set of results' })
  @ApiParam({
    name: 'resultId',
    description: 'The unique ID of the result record',
  })
  async approveResult(
    @Param('schoolId') schoolId: string,
    @Param('resultId') resultId: string,
    @Body() dto: ApproveResultDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const approvedById = req.user.sub || req.user.id;
    const data = await this.resultsService.approveResult(
      schoolId,
      resultId,
      approvedById,
      dto,
    );
    const message =
      dto.status === 'APPROVED'
        ? 'Results approved successfully.'
        : 'Results rejected.';
    return envelope(res, HttpStatus.OK, message, data);
  }

  // ─── Student / Parent / Admin: View approved results by student ID ──
  @Get('student/:studentId')
  @Roles(
    'STUDENT',
    'PARENT',
    'TEACHER',
    'SCHOOL_ADMIN',
    'ICT_ADMIN',
    'DIRECTOR',
    'PRINCIPAL',
    'SCHOOL_OWNER',
  )
  @ApiOperation({ summary: 'Retrieve approved result sheet for a student' })
  @ApiQuery({
    name: 'sessionName',
    required: false,
    description: 'Session name e.g. "2025/2026"',
  })
  @ApiQuery({
    name: 'termName',
    required: false,
    description: 'Term name e.g. "First Term"',
  })
  async getStudentResults(
    @Param('schoolId') schoolId: string,
    @Param('studentId') studentId: string,
    @Query('sessionName') sessionName: string,
    @Query('termName') termName: string,
    @Res() res: Response,
  ) {
    const data = await this.resultsService.getStudentResults(
      schoolId,
      studentId,
      sessionName,
      termName,
    );
    return envelope(
      res,
      HttpStatus.OK,
      'Student results retrieved successfully.',
      data,
    );
  }

  @Get('student/:studentId/print')
  @Roles(
    'STUDENT',
    'PARENT',
    'TEACHER',
    'SCHOOL_ADMIN',
    'ICT_ADMIN',
    'DIRECTOR',
    'PRINCIPAL',
    'SCHOOL_OWNER',
  )
  @ApiOperation({
    summary: 'Retrieve print-ready approved result sheet for a student',
  })
  @ApiQuery({
    name: 'sessionName',
    required: true,
    description: 'Session name e.g. "2025/2026"',
  })
  @ApiQuery({
    name: 'termName',
    required: true,
    description: 'Term name e.g. "First Term"',
  })
  async getPrintableResults(
    @Param('schoolId') schoolId: string,
    @Param('studentId') studentId: string,
    @Query('sessionName') sessionName: string,
    @Query('termName') termName: string,
    @Res() res: Response,
  ) {
    if (!sessionName || !termName) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          'Both sessionName and termName are required for printable results.',
      });
    }

    const data = await this.resultsService.getStudentResults(
      schoolId,
      studentId,
      sessionName,
      termName,
    );

    const specificResult = data.results.find(
      (r: any) =>
        (r.session.name === sessionName || r.session.id === sessionName) &&
        (r.term?.name === termName || r.term?.id === termName),
    );

    if (!specificResult) {
      throw new NotFoundException(
        `No approved results found for student in ${sessionName} - ${termName}`,
      );
    }

    return envelope(
      res,
      HttpStatus.OK,
      'Printable results retrieved successfully.',
      {
        schoolInfo: data.schoolInfo,
        student: data.student,
        result: specificResult,
      },
    );
  }

  // ─── Parent: Look up child's results by registration number ─────────
  @Get('parent/student-results')
  @Roles(
    'PARENT',
    'TEACHER',
    'SCHOOL_ADMIN',
    'ICT_ADMIN',
    'DIRECTOR',
    'PRINCIPAL',
    'SCHOOL_OWNER',
  )
  @ApiOperation({
    summary: 'Parent retrieves approved results by student registration number',
  })
  @ApiQuery({
    name: 'regNo',
    required: true,
    description: 'Student registration number',
  })
  @ApiQuery({
    name: 'sessionName',
    required: false,
    description: 'Session name e.g. "2025/2026"',
  })
  @ApiQuery({
    name: 'termName',
    required: false,
    description: 'Term name e.g. "First Term"',
  })
  async getStudentResultsByRegNo(
    @Param('schoolId') schoolId: string,
    @Query('regNo') regNo: string,
    @Query('sessionName') sessionName: string,
    @Query('termName') termName: string,
    @Res() res: Response,
  ) {
    if (!regNo) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Registration number (regNo) is required.',
      });
    }
    const data = await this.resultsService.getStudentResultsByRegNo(
      schoolId,
      regNo,
      sessionName,
      termName,
    );
    return envelope(
      res,
      HttpStatus.OK,
      'Student results retrieved successfully.',
      data,
    );
  }

  // ─── Admin / Teacher: View approved results for a class arm ─────────
  @Get('class/sheet')
  @Roles(
    'TEACHER',
    'SCHOOL_ADMIN',
    'ICT_ADMIN',
    'DIRECTOR',
    'PRINCIPAL',
    'SCHOOL_OWNER',
  )
  @ApiOperation({ summary: 'Retrieve approved results for a class arm' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'classArmId', required: true })
  @ApiQuery({
    name: 'sessionName',
    required: true,
    description: 'Session name e.g. "2025/2026"',
  })
  @ApiQuery({
    name: 'termName',
    required: false,
    description: 'Term name e.g. "First Term"',
  })
  async getClassResults(
    @Param('schoolId') schoolId: string,
    @Query('classId') classId: string,
    @Query('classArmId') classArmId: string,
    @Query('sessionName') sessionName: string,
    @Query('termName') termName: string,
    @Res() res: Response,
  ) {
    const data = await this.resultsService.getClassResults(
      schoolId,
      classId,
      classArmId,
      sessionName,
      termName,
    );
    return envelope(
      res,
      HttpStatus.OK,
      'Class results retrieved successfully.',
      data,
    );
  }
}
