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
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Subjects')
@Controller('subjects')
@ApiHeader({
  name: 'x-idempotency-key',
  description: 'Unique key to avoid duplicate processing of the same request',
  required: false,
})
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post(':schoolId')
  @Roles('SCHOOL_OWNER', 'DIRECTOR', 'PRINCIPAL', 'ICT_ADMIN')
  @ApiOperation({ summary: 'Create a new subject for a school' })
  @ApiParam({ name: 'schoolId', description: 'The unique ID of the school' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'The subject has been successfully created.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Subject name or code already exists in this school.',
  })
  async create(
    @Param('schoolId') schoolId: string,
    @Body() dto: CreateSubjectDto,
    @Res() res: Response,
  ) {
    const data = await this.subjectsService.create(schoolId, dto);
    return res.status(HttpStatus.CREATED).json({
      statusCode: HttpStatus.CREATED,
      message: 'Subject created successfully',
      data,
    });
  }

  @Get('school/:schoolId')
  @ApiOperation({ summary: 'Get all subjects for a school' })
  @ApiParam({ name: 'schoolId', description: 'The unique ID of the school' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of subjects retrieved.',
  })
  async findAll(@Param('schoolId') schoolId: string, @Res() res: Response) {
    const data = await this.subjectsService.findAll(schoolId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Subjects list retrieved successfully',
      data,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single subject by ID' })
  @ApiParam({ name: 'id', description: 'The unique ID of the subject' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subject details retrieved.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Subject not found.',
  })
  async findOne(@Param('id') id: string, @Res() res: Response) {
    const data = await this.subjectsService.findOne(id);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Subject details retrieved successfully',
      data,
    });
  }

  @Patch(':id')
  @Roles('SCHOOL_OWNER', 'DIRECTOR', 'PRINCIPAL', 'ICT_ADMIN')
  @ApiOperation({ summary: 'Update subject details' })
  @ApiParam({ name: 'id', description: 'The unique ID of the subject' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subject details updated.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Subject not found.',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSubjectDto,
    @Res() res: Response,
  ) {
    const data = await this.subjectsService.update(id, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Subject updated successfully',
      data,
    });
  }

  @Delete(':id')
  @Roles('SCHOOL_OWNER', 'DIRECTOR', 'PRINCIPAL', 'ICT_ADMIN')
  @ApiOperation({ summary: 'Delete a subject' })
  @ApiParam({ name: 'id', description: 'The unique ID of the subject' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subject deleted successfully.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Subject not found.',
  })
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.subjectsService.remove(id);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Subject deleted successfully',
    });
  }
}
