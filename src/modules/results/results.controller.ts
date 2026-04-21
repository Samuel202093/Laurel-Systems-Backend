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
} from '@nestjs/common';
import type { Response } from 'express';
import { ResultsService } from './results.service';
import { UploadResultDto } from './dto/upload-result.dto';
import { ApproveResultDto } from './dto/approve-result.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Results')
@ApiBearerAuth()
@Controller('results/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  // ─── Teacher uploads / re-uploads results for a subject ─────────────
  @Post('upload')
  @Roles('TEACHER', 'ICT_ADMIN', 'DIRECTOR', 'PRINCIPAL', 'SCHOOL_OWNER')
  @ApiOperation({ summary: 'Upload or update results for a specific class, arm, and subject' })
  @ApiParam({ name: 'schoolId', description: 'The unique ID of the school' })
  async uploadResults(
    @Param('schoolId') schoolId: string,
    @Body() dto: UploadResultDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const teacherId = req.user.sub || req.user.id;
    const data = await this.resultsService.uploadResults(schoolId, teacherId, dto);

    const message = data.isUpdate
      ? 'Results updated successfully and awaiting re-approval.'
      : 'Results uploaded successfully and awaiting approval.';

    return res.status(data.isUpdate ? HttpStatus.OK : HttpStatus.CREATED).json({
      statusCode: data.isUpdate ? HttpStatus.OK : HttpStatus.CREATED,
      message,
      data,
    });
  }

  // ─── Teacher: View my uploaded results with their statuses ──────────
  @Get('my-results')
  @Roles('TEACHER', 'ICT_ADMIN', 'DIRECTOR', 'PRINCIPAL', 'SCHOOL_OWNER')
  @ApiOperation({ summary: 'Teacher retrieves all results they have uploaded' })
  async getTeacherResults(
    @Param('schoolId') schoolId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const teacherId = req.user.sub || req.user.id;
    const data = await this.resultsService.getTeacherResults(schoolId, teacherId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Your uploaded results retrieved successfully.',
      data,
    });
  }

  // ─── Admin: Get results awaiting approval ───────────────────────────
  @Get('pending')
  @Roles('ICT_ADMIN', 'DIRECTOR', 'PRINCIPAL', 'SCHOOL_OWNER')
  @ApiOperation({ summary: 'Admin/Director/Principal retrieves results awaiting approval' })
  async getPendingResults(@Param('schoolId') schoolId: string, @Res() res: Response) {
    const data = await this.resultsService.getPendingResults(schoolId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Pending results retrieved successfully.',
      data,
    });
  }

  // ─── Admin: Approve or reject a result ──────────────────────────────
  @Patch(':resultId/approve')
  @Roles('ICT_ADMIN', 'DIRECTOR', 'PRINCIPAL', 'SCHOOL_OWNER')
  @ApiOperation({ summary: 'Approve or Reject a set of results' })
  @ApiParam({ name: 'resultId', description: 'The unique ID of the result record' })
  async approveResult(
    @Param('schoolId') schoolId: string,
    @Param('resultId') resultId: string,
    @Body() dto: ApproveResultDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const approvedById = req.user.sub || req.user.id;
    const data = await this.resultsService.approveResult(schoolId, resultId, approvedById, dto);
    const message = dto.status === 'APPROVED' ? 'Results approved successfully.' : 'Results rejected.';
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message,
      data,
    });
  }

  // ─── Student / Parent / Admin: View approved results by student ID ──
  @Get('student/:studentId')
  @Roles('STUDENT', 'PARENT', 'TEACHER', 'ICT_ADMIN', 'DIRECTOR', 'PRINCIPAL', 'SCHOOL_OWNER')
  @ApiOperation({ summary: 'Retrieve approved result sheet for a student' })
  @ApiQuery({ name: 'sessionName', required: false, description: 'Session name e.g. "2025/2026"' })
  @ApiQuery({ name: 'termName', required: false, description: 'Term name e.g. "First Term"' })
  async getStudentResults(
    @Param('schoolId') schoolId: string,
    @Param('studentId') studentId: string,
    @Query('sessionName') sessionName: string,
    @Query('termName') termName: string,
    @Res() res: Response,
  ) {
    const data = await this.resultsService.getStudentResults(schoolId, studentId, sessionName, termName);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Student results retrieved successfully.',
      data,
    });
  }

  // ─── Parent: Look up child's results by registration number ─────────
  @Get('parent/student-results')
  @Roles('PARENT', 'TEACHER', 'ICT_ADMIN', 'DIRECTOR', 'PRINCIPAL', 'SCHOOL_OWNER')
  @ApiOperation({ summary: 'Parent retrieves approved results by student registration number' })
  @ApiQuery({ name: 'regNo', required: true, description: 'Student registration number' })
  @ApiQuery({ name: 'sessionName', required: false, description: 'Session name e.g. "2025/2026"' })
  @ApiQuery({ name: 'termName', required: false, description: 'Term name e.g. "First Term"' })
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
    const data = await this.resultsService.getStudentResultsByRegNo(schoolId, regNo, sessionName, termName);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Student results retrieved successfully.',
      data,
    });
  }

  // ─── Admin / Teacher: View approved results for a class arm ─────────
  @Get('class')
  @Roles('TEACHER', 'ICT_ADMIN', 'DIRECTOR', 'PRINCIPAL', 'SCHOOL_OWNER')
  @ApiOperation({ summary: 'Retrieve approved results for a class arm' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'classArmId', required: true })
  @ApiQuery({ name: 'sessionName', required: true, description: 'Session name e.g. "2025/2026"' })
  @ApiQuery({ name: 'termName', required: false, description: 'Term name e.g. "First Term"' })
  async getClassResults(
    @Param('schoolId') schoolId: string,
    @Query('classId') classId: string,
    @Query('classArmId') classArmId: string,
    @Query('sessionName') sessionName: string,
    @Query('termName') termName: string,
    @Res() res: Response,
  ) {
    const data = await this.resultsService.getClassResults(schoolId, classId, classArmId, sessionName, termName);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Class results retrieved successfully.',
      data,
    });
  }
}
