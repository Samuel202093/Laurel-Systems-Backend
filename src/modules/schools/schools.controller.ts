import { Controller, Post, Body, Get, Param, Query, Res, HttpStatus, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { SchoolsService } from './schools.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiHeader } from '@nestjs/swagger';

@ApiTags('Schools')
@Controller('schools')
@ApiHeader({
  name: 'x-idempotency-key',
  description: 'Unique key to avoid duplicate processing of the same request',
  required: false,
})
export class SchoolsController {
  constructor(private schoolsService: SchoolsService) {}

  @Post('register')
  async register(@Body() createSchoolDto: CreateSchoolDto, @Res() res: Response) {
    const result = await this.schoolsService.registerSchool(createSchoolDto);
    return res.status(HttpStatus.CREATED).json({
      statusCode: HttpStatus.CREATED,
      message: 'School registered successfully',
      data: result,
    });
  }

  @Get('identify')
  async getSchoolId(@Query('email') email: string, @Res() res: Response) {
    if (!email) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Email query parameter is required',
      });
    }

    const schoolId = await this.schoolsService.getSchoolIdByEmail(email);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'School ID retrieved successfully',
      data: { schoolId },
    });
  }

  @Get()
  async findAll(@Res() res: Response) {
    const schools = await this.schoolsService.findAll();
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Schools retrieved successfully',
      data: schools,
    });
  }

  // Onboarding progress endpoints
  @Post('onboarding/progress')
  async saveProgress(@Body() body: { email: string; step: number; data: any }, @Res() res: Response) {
    const progress = await this.schoolsService.saveOnboardingProgress(body.email, body.step, body.data);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Onboarding progress saved successfully',
      data: progress,
    });
  }

  @Get('onboarding/progress/:email')
  async getProgress(@Param('email') email: string, @Res() res: Response) {
    const progress = await this.schoolsService.getOnboardingProgress(email);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Onboarding progress retrieved successfully',
      data: progress,
    });
  }
}
