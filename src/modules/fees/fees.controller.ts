import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Response } from 'express';
import { FeesService } from './fees.service';
import { CreateFeeDto } from './dto/create-fee.dto';
import { UpdateFeeDto } from './dto/update-fee.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiHeader,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Fee Configurations')
@Controller('fees')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  // ─── Diagnostic ──────────────────────────────────────────────────────────

  @Get('debug')
  @Roles(
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'TEACHER',
    'STUDENT',
    'SCHOOL_ADMIN',
  )
  debug() {
    return { status: 'ok', message: 'FeesController is reachable' };
  }

  // ─── Student specific fees ──────────────────────────────────────────────

  @Get('student/:studentId')
  @Roles(
    'STUDENT',
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'SCHOOL_ADMIN',
  )
  @ApiOperation({
    summary:
      'Get all fees applicable to a specific student based on their class',
  })
  async findFeesForStudent(
    @Param('studentId') studentId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const schoolId = req.user.schoolId;
    const data = await this.feesService.findFeesForStudent(studentId, schoolId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Student fees retrieved successfully',
      data,
    });
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  @Post()
  @Roles('SCHOOL_OWNER', 'DIRECTOR', 'PRINCIPAL', 'ICT_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Create a new fee configuration' })
  async create(
    @Body() dto: CreateFeeDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    // Ensure schoolId matches user's school or user is Super Admin
    const schoolId = req.user.schoolId || dto.schoolId;
    const data = await this.feesService.create({ ...dto, schoolId });
    return res.status(HttpStatus.CREATED).json({
      statusCode: HttpStatus.CREATED,
      message: 'Fee configuration authorized successfully',
      data,
    });
  }

  // ─── List by school ────────────────────────────────────────────────────────

  @Get('school/:schoolId')
  @Roles(
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'TEACHER',
    'STUDENT',
    'SCHOOL_ADMIN',
  )
  @ApiOperation({ summary: 'Get all fee configurations for a school' })
  async findAllBySchool(
    @Param('schoolId') schoolId: string,
    @Query('session') session?: string,
    @Query('term') term?: string,
    @Query('feeCategory') feeCategory?: string,
    @Res() res?: Response,
  ) {
    const data = await this.feesService.findAllBySchool(schoolId, {
      session,
      term,
      feeCategory,
    });
    return res!.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Fee configurations retrieved successfully',
      data,
    });
  }

  // ─── Get one ──────────────────────────────────────────────────────────────

  @Get(':id')
  @Roles(
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'TEACHER',
    'STUDENT',
    'SCHOOL_ADMIN',
  )
  @ApiOperation({ summary: 'Get a single fee configuration by ID' })
  async findOne(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const schoolId = req.user.schoolId;
    const data = await this.feesService.findOne(id, schoolId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Fee configuration retrieved successfully',
      data,
    });
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  @Patch(':id')
  @Roles('SCHOOL_OWNER', 'DIRECTOR', 'PRINCIPAL', 'ICT_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Update a fee configuration' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFeeDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const schoolId = req.user.schoolId || dto.schoolId;
    const data = await this.feesService.update(id, schoolId, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Fee configuration updated successfully',
      data,
    });
  }

  // ─── Delete (soft) ────────────────────────────────────────────────────────

  @Delete(':id')
  @Roles('SCHOOL_OWNER', 'DIRECTOR', 'PRINCIPAL', 'ICT_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Soft-delete a fee configuration' })
  async remove(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const schoolId = req.user.schoolId;
    await this.feesService.softDelete(id, schoolId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Fee configuration removed successfully',
    });
  }
}
