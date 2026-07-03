import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Delete,
  Res,
  HttpStatus,
  UseGuards,
  Query,
} from '@nestjs/common';
import type { Response } from 'express';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import {
  PromoteStudentDto,
  PromoteMultipleStudentsDto,
} from './dto/promote-student.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Students')
@Controller('students/:schoolId')
@ApiBearerAuth()
export class StudentsController {
  constructor(private studentsService: StudentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'SUB_ADMIN',
    'TEACHER',
    'SCHOOL_ADMIN',
  )
  @ApiOperation({ summary: 'Create a new student' })
  @ApiResponse({ status: 201, description: 'Student created successfully' })
  async create(
    @Param('schoolId') schoolId: string,
    @Body() dto: CreateStudentDto,
    @Res() res: Response,
  ) {
    const data = await this.studentsService.create(schoolId, dto);
    return res.status(HttpStatus.CREATED).json({
      statusCode: HttpStatus.CREATED,
      message: 'Student created successfully',
      data,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'SUB_ADMIN',
    'TEACHER',
  )
  @ApiOperation({
    summary: 'Get all students for a school with pagination and filters',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'classId', required: false, type: String })
  @ApiQuery({ name: 'classArmId', required: false, type: String })
  async findAll(
    @Param('schoolId') schoolId: string,
    @Res() res: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('classId') classId?: string,
    @Query('classArmId') classArmId?: string,
  ) {
    const data = await this.studentsService.findAll(schoolId, {
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      classId,
      classArmId,
    });
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Students retrieved successfully',
      data,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'SUB_ADMIN',
    'TEACHER',
    'STUDENT',
  )
  @ApiOperation({ summary: 'Get a single student by ID' })
  async findOne(
    @Param('schoolId') schoolId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const data = await this.studentsService.findOne(schoolId, id);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Student retrieved successfully',
      data,
    });
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'SUB_ADMIN',
    'TEACHER',
    'STUDENT',
  )
  @ApiOperation({ summary: 'Update a student' })
  async update(
    @Param('schoolId') schoolId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @Res() res: Response,
  ) {
    const data = await this.studentsService.update(schoolId, id, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Student updated successfully',
      data,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'SUB_ADMIN',
  )
  @ApiOperation({ summary: 'Delete a student' })
  async remove(
    @Param('schoolId') schoolId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    await this.studentsService.remove(schoolId, id);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Student deleted successfully',
    });
  }

  @Post('promote')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'SUB_ADMIN',
  )
  @ApiOperation({ summary: 'Promote a student to a new class' })
  async promote(
    @Param('schoolId') schoolId: string,
    @Body() dto: PromoteStudentDto,
    @Res() res: Response,
  ) {
    const data = await this.studentsService.promote(schoolId, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Student promoted successfully',
      data,
    });
  }

  @Post('promote-multiple')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'SUB_ADMIN',
  )
  @ApiOperation({ summary: 'Promote multiple students to a new class' })
  async promoteMultiple(
    @Param('schoolId') schoolId: string,
    @Body() dto: PromoteMultipleStudentsDto,
    @Res() res: Response,
  ) {
    const data = await this.studentsService.promoteMultiple(schoolId, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: data.message,
      data,
    });
  }
}
