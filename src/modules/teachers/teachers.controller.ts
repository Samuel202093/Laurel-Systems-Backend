import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiHeader } from '@nestjs/swagger';

@ApiTags('Teachers')
@Controller('teachers')
@ApiHeader({
  name: 'x-idempotency-key',
  description: 'Unique key to avoid duplicate processing of the same request',
  required: false,
})
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Post(':schoolId')
  @ApiOperation({ summary: 'Create a new staff or teacher for a school' })
  @ApiParam({ name: 'schoolId', description: 'The unique ID of the school' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'The staff has been successfully created.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email or Staff ID already exists.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'School not found.',
  })
  async create(
    @Param('schoolId') schoolId: string,
    @Body() createTeacherDto: CreateTeacherDto,
    @Res() res: Response,
  ) {
    const data = await this.teachersService.create(schoolId, createTeacherDto);
    return res.status(HttpStatus.CREATED).json({
      statusCode: HttpStatus.CREATED,
      message: 'Staff created successfully',
      data,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update staff or teacher details' })
  @ApiParam({ name: 'id', description: 'The unique ID of the teacher' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Staff details updated.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Staff not found.' })
  async update(
    @Param('id') id: string,
    @Body() updateTeacherDto: UpdateTeacherDto,
    @Res() res: Response,
  ) {
    const data = await this.teachersService.update(id, updateTeacherDto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Staff updated successfully',
      data,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a staff or teacher' })
  @ApiParam({ name: 'id', description: 'The unique ID of the teacher' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Staff deleted successfully.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Staff not found.' })
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.teachersService.remove(id);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Staff deleted successfully',
    });
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend a staff or teacher' })
  @ApiParam({ name: 'id', description: 'The unique ID of the teacher' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Staff suspended.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Staff already suspended.' })
  async suspend(@Param('id') id: string, @Res() res: Response) {
    const data = await this.teachersService.suspend(id);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Staff suspended successfully',
      data,
    });
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a suspended staff or teacher' })
  @ApiParam({ name: 'id', description: 'The unique ID of the teacher' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Staff activated.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Staff already active.' })
  async activate(@Param('id') id: string, @Res() res: Response) {
    const data = await this.teachersService.activate(id);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Staff activated successfully',
      data,
    });
  }

  @Patch(':id/roles')
  @ApiOperation({ summary: 'Assign multiple roles to a staff or teacher' })
  @ApiParam({ name: 'id', description: 'The unique ID of the teacher' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Roles updated.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Staff not found.' })
  async assignRoles(
    @Param('id') id: string,
    @Body('roles') roles: string[],
    @Res() res: Response,
  ) {
    const data = await this.teachersService.assignRoles(id, roles);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Staff roles updated successfully',
      data,
    });
  }

  @Get('school/:schoolId')
  @ApiOperation({ summary: 'Get all staff/teachers for a school' })
  @ApiParam({ name: 'schoolId', description: 'The unique ID of the school' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of staff retrieved.' })
  async findAll(@Param('schoolId') schoolId: string, @Res() res: Response) {
    const data = await this.teachersService.findAll(schoolId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Staff list retrieved successfully',
      data,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single staff/teacher by ID' })
  @ApiParam({ name: 'id', description: 'The unique ID of the teacher' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Staff details retrieved.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Staff not found.' })
  async findOne(@Param('id') id: string, @Res() res: Response) {
    const data = await this.teachersService.findOne(id);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Staff details retrieved successfully',
      data,
    });
  }
}
