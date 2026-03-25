import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Delete,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiHeader } from '@nestjs/swagger';

@ApiTags('Bank Accounts')
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new bank account for a school' })
  @ApiHeader({
    name: 'x-idempotency-key',
    description: 'Unique key to avoid duplicate processing of the same request',
    required: false,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Bank account created successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'School not found.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Bank account already exists.',
  })
  async create(
    @Body() createBankAccountDto: CreateBankAccountDto,
    @Res() res: Response,
  ) {
    const data = await this.bankAccountsService.create(createBankAccountDto);
    return res.status(HttpStatus.CREATED).json({
      statusCode: HttpStatus.CREATED,
      message: 'Bank account created successfully',
      data,
    });
  }

  @Get('school/:schoolId')
  @ApiOperation({ summary: 'Get all bank accounts for a school' })
  @ApiParam({ name: 'schoolId', description: 'The unique ID of the school' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Bank accounts retrieved.' })
  async findAllBySchoolId(@Param('schoolId') schoolId: string, @Res() res: Response) {
    const data = await this.bankAccountsService.findAllBySchoolId(schoolId);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Bank accounts retrieved successfully',
      data,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific bank account by ID' })
  @ApiParam({ name: 'id', description: 'The unique ID of the bank account' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Bank account retrieved.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Bank account not found.' })
  async findOne(@Param('id') id: string, @Res() res: Response) {
    const data = await this.bankAccountsService.findOne(id);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Bank account retrieved successfully',
      data,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a specific bank account' })
  @ApiParam({ name: 'id', description: 'The unique ID of the bank account' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Bank account updated successfully.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Bank account not found.' })
  async update(
    @Param('id') id: string,
    @Body() updateBankAccountDto: UpdateBankAccountDto,
    @Res() res: Response,
  ) {
    const data = await this.bankAccountsService.update(id, updateBankAccountDto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Bank account updated successfully',
      data,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a specific bank account' })
  @ApiParam({ name: 'id', description: 'The unique ID of the bank account' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Bank account removed successfully.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Bank account not found.' })
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.bankAccountsService.remove(id);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Bank account removed successfully',
    });
  }
}
