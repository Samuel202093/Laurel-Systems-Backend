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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiHeader, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

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

  @Patch(':id/avatar')
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 2 * 1024 * 1024, // 2MB
    },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new BadRequestException('Only image files are allowed'), false);
      }
      cb(null, true);
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Update profile picture' })
  @ApiParam({ name: 'id', description: 'The unique ID of the teacher' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Profile picture updated.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Staff not found.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid file or size.' })
  async updateAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded or file is too large (max 2MB)');
    }
    const data = await this.teachersService.updateAvatar(id, file);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Profile picture updated successfully',
      data,
    });
  }

  @Patch(':id/change-password')
  @ApiOperation({ summary: 'Change teacher password' })
  @ApiParam({ name: 'id', description: 'The unique ID of the teacher' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Password changed successfully.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid data or passwords do not match.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Staff not found.' })
  async changePassword(
    @Param('id') id: string,
    @Body() changePasswordDto: ChangePasswordDto,
    @Res() res: Response,
  ) {
    const data = await this.teachersService.changePassword(id, changePasswordDto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Password changed successfully',
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

  @Get(':id/school/:schoolId/assigned-classes')
  @ApiOperation({ summary: 'Fetch classes and arms assigned to a particular teacher in a school' })
  @ApiParam({ name: 'id', description: 'The unique ID of the teacher' })
  @ApiParam({ name: 'schoolId', description: 'The unique ID of the school' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of assigned classes and arms retrieved successfully.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Teacher or school not found.',
  })
  async getAssignedClasses(
    @Param('id') id: string,
    @Param('schoolId') schoolId: string,
    @Res() res: Response,
  ) {
    const data = await this.teachersService.getAssignedClasses(id, schoolId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Assigned classes retrieved successfully',
      data,
    });
  }

  @Get(':id/school/:schoolId/assigned-students')
  @ApiOperation({ summary: 'Fetch students based on the classes assigned to the teacher' })
  @ApiParam({ name: 'id', description: 'The unique ID of the teacher' })
  @ApiParam({ name: 'schoolId', description: 'The unique ID of the school' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of students assigned to the teacher retrieved successfully.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Teacher or school not found.',
  })
  async getAssignedStudents(
    @Param('id') id: string,
    @Param('schoolId') schoolId: string,
    @Res() res: Response,
  ) {
    const data = await this.teachersService.getAssignedStudents(id, schoolId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Assigned students retrieved successfully',
      data,
    });
  }
}
