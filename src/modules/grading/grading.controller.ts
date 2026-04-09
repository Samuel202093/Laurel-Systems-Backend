import { Controller, Get, Post, Body, Param, Query, HttpStatus, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { GradingService } from './grading.service';
import { CreateGradingSystemDto } from './dto/grading-system.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Grading System')
@Controller('grading')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradingController {
  constructor(private readonly gradingService: GradingService) {}

  @Get(':schoolId')
  @ApiOperation({ summary: 'Get grading system configuration for a specific session/term' })
  @ApiParam({ name: 'schoolId', description: 'The unique ID of the school' })
  @ApiQuery({ name: 'sessionId', description: 'The academic session ID' })
  @ApiQuery({ name: 'termId', required: false, description: 'The academic term ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Grading system retrieved.' })
  async getGradingSystem(
    @Param('schoolId') schoolId: string,
    @Query('sessionId') sessionId: string,
    @Query('termId') termId: string,
    @Res() res: Response,
  ) {
    const data = await this.gradingService.getGradingSystem(schoolId, sessionId, termId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Grading system retrieved successfully',
      data,
    });
  }

  @Post(':schoolId')
  @Roles('SCHOOL_OWNER', 'DIRECTOR', 'PRINCIPAL', 'ICT_ADMIN')
  @ApiOperation({ summary: 'Update or create grading system configuration' })
  @ApiParam({ name: 'schoolId', description: 'The unique ID of the school' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Grading system updated.' })
  async updateGradingSystem(
    @Param('schoolId') schoolId: string,
    @Body() dto: CreateGradingSystemDto,
    @Res() res: Response,
  ) {
    const data = await this.gradingService.updateGradingSystem(schoolId, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Grading system updated successfully',
      data,
    });
  }
}
