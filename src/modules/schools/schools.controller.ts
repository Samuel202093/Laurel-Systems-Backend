import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  Res,
  HttpStatus,
  NotFoundException,
  UseGuards,
  Patch,
  Req,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { SchoolsService } from './schools.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import {
  UpdateCalendarDto,
  UpdateGradingDto,
  UpdateLocationDto,
  UpdatePreferencesDto,
  UpdateBrandingDto,
} from './dto/settings.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SchoolAdminRole } from '@prisma/client';

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
  async register(
    @Body() createSchoolDto: CreateSchoolDto,
    @Res() res: Response,
  ) {
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
  async saveProgress(
    @Body() body: { email: string; step: number; data: any },
    @Res() res: Response,
  ) {
    const progress = await this.schoolsService.saveOnboardingProgress(
      body.email,
      body.step,
      body.data,
    );
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

  // ─── SYSTEM SETTINGS ENDPOINTS ──────────────────────────────────────────

  @Get('settings')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    SchoolAdminRole.SCHOOL_OWNER,
    SchoolAdminRole.DIRECTOR,
    SchoolAdminRole.ICT_ADMIN,
  )
  async getSettings(@Req() req: any, @Res() res: Response) {
    const schoolId = req.user.schoolId;
    const settings = await this.schoolsService.getSettings(schoolId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Settings retrieved successfully',
      data: settings,
    });
  }

  @Patch('settings/calendar')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SchoolAdminRole.SCHOOL_OWNER, SchoolAdminRole.DIRECTOR)
  async updateCalendar(
    @Req() req: any,
    @Body() dto: UpdateCalendarDto,
    @Res() res: Response,
  ) {
    const schoolId = req.user.schoolId;
    const result = await this.schoolsService.updateCalendar(schoolId, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: result.message,
    });
  }

  @Patch('settings/grading')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SchoolAdminRole.SCHOOL_OWNER, SchoolAdminRole.DIRECTOR)
  async updateGrading(
    @Req() req: any,
    @Body() dto: UpdateGradingDto,
    @Res() res: Response,
  ) {
    const schoolId = req.user.schoolId;
    const result = await this.schoolsService.updateGrading(schoolId, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Grading system updated successfully',
      data: result,
    });
  }

  @Patch('settings/location')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SchoolAdminRole.SCHOOL_OWNER, SchoolAdminRole.DIRECTOR)
  async updateLocation(
    @Req() req: any,
    @Body() dto: UpdateLocationDto,
    @Res() res: Response,
  ) {
    const schoolId = req.user.schoolId;
    const result = await this.schoolsService.updateLocation(schoolId, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Location settings updated successfully',
      data: result,
    });
  }

  @Patch('settings/preferences')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SchoolAdminRole.SCHOOL_OWNER, SchoolAdminRole.DIRECTOR)
  async updatePreferences(
    @Req() req: any,
    @Body() dto: UpdatePreferencesDto,
    @Res() res: Response,
  ) {
    const schoolId = req.user.schoolId;
    const result = await this.schoolsService.updatePreferences(schoolId, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Global preferences updated successfully',
      data: result,
    });
  }

  @Patch('settings/branding')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SchoolAdminRole.SCHOOL_OWNER, SchoolAdminRole.DIRECTOR)
  async updateBranding(
    @Req() req: any,
    @Body() dto: UpdateBrandingDto,
    @Res() res: Response,
  ) {
    const schoolId = req.user.schoolId;
    const result = await this.schoolsService.updateBranding(schoolId, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'School branding updated successfully',
      data: result,
    });
  }
}
