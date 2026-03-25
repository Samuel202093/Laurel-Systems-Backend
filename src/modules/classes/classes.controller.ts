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
} from '@nestjs/common';
import type { Response } from 'express';
import { ClassesService } from './classes.service';
import { ClassSetupDto } from './dto/class-setup.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiHeader, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Classes')
@Controller('classes')
@ApiHeader({
  name: 'x-idempotency-key',
  description: 'Unique key to avoid duplicate processing of the same request',
  required: false,
})
@ApiBearerAuth()
export class ClassesController {
  constructor(private classesService: ClassesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'SCHOOL_OWNER',
    'DIRECTOR',
    'PRINCIPAL',
    'ICT_ADMIN',
    'SUB_ADMIN',
  )
  @ApiOperation({ summary: 'Create a new class' })
  async create(
    @Body() dto: CreateClassDto,
    @Res() res: Response
  ) {
    const data = await this.classesService.create(dto);
    return res.status(HttpStatus.CREATED).json({
      statusCode: HttpStatus.CREATED,
      message: 'Class created successfully',
      data,
    });
  }

  @Get('school/:schoolId')
  @ApiOperation({ summary: 'Get all classes for a school' })
  async findAll(
    @Param('schoolId') schoolId: string,
    @Res() res: Response
  ) {
    const data = await this.classesService.findAll(schoolId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Classes retrieved successfully',
      data,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single class by ID' })
  async findOne(
    @Param('id') id: string,
    @Res() res: Response
  ) {
    const data = await this.classesService.findOne(id);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Class retrieved successfully',
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
  )
  @ApiOperation({ summary: 'Update a class' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClassDto,
    @Res() res: Response
  ) {
    const data = await this.classesService.update(id, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Class updated successfully',
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
  @ApiOperation({ summary: 'Delete a class' })
  async remove(
    @Param('id') id: string,
    @Res() res: Response
  ) {
    await this.classesService.remove(id);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Class deleted successfully',
    });
  }

  @Post('setup/:schoolId')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(
  //   'SUPER_ADMIN',
  //   'SCHOOL_OWNER',
  //   'DIRECTOR',
  //   'PRINCIPAL',
  //   'ICT_ADMIN',
  //   'SUB_ADMIN',
  //   'TEACHER',
  //   'SCHOOL_ADMIN',
  // )
  async saveSetup(
    @Param('schoolId') schoolId: string,
    @Body() dto: ClassSetupDto,
    @Res() res: Response
  ) {
    const setup = await this.classesService.saveClassSetup(schoolId, dto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Class setup saved successfully',
      data: setup,
    });
  }

  @Get('setup/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  'SUPER_ADMIN',
  'SCHOOL_OWNER',
  'DIRECTOR',
  'PRINCIPAL',
  'ICT_ADMIN',    
  'SUB_ADMIN',
  'TEACHER',
  'SCHOOL_ADMIN', 
)
  @ApiOperation({ summary: 'Get class setup for a school' })
  async getSetup(
    @Param('schoolId') schoolId: string,
    @Res() res: Response
  ) {
    const setup = await this.classesService.getClassSetup(schoolId);
    
    if (!setup) {
      return res.status(HttpStatus.OK).json({
        statusCode: HttpStatus.OK,
        message: 'No class setup found',
        data: null,
      });
    }

    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Class setup retrieved successfully',
      data: setup,
    });
  }
}
