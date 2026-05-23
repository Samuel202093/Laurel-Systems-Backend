import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, HttpStatus, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PlatformConfigService } from './platform-config.service';
import { CreatePlatformConfigDto, UpdatePlatformConfigDto } from './dto/platform-config.dto';

@ApiTags('Platform Config (super-admin)')
@Controller('admin/platform-config')
@ApiBearerAuth()
// @UseGuards(SuperAdminGuard) ← add your super-admin guard here
export class PlatformConfigController {
  constructor(private readonly svc: PlatformConfigService) {}

  @Get()
  @ApiOperation({ summary: 'List all platform charge configs (global + school-specific)' })
  @ApiQuery({ name: 'schoolId', required: false })
  async list(@Query('schoolId') schoolId: string | undefined, @Res() res: Response) {
    const data = await this.svc.listConfigs(schoolId);
    return res.status(HttpStatus.OK).json({ statusCode: 200, data });
  }

  @Get('preview')
  @ApiOperation({
    summary: 'Preview what charge a given amount would incur for a school',
    description: 'Pass amountKobo and schoolId — returns the full charge breakdown. Use this to show fees to schools before committing.',
  })
  @ApiQuery({ name: 'amountKobo', required: true })
  @ApiQuery({ name: 'schoolId', required: true })
  async preview(@Query('amountKobo') amountKobo: string, @Query('schoolId') schoolId: string, @Res() res: Response) {
    const amount = parseInt(amountKobo, 10);
    const config = await this.svc.getEffectiveConfig(schoolId);
    const charge = this.svc.applyChargeFormula(amount, config);

    return res.status(HttpStatus.OK).json({
      statusCode: 200,
      data: {
        principalNaira: amount / 100,
        platformChargeNaira: charge / 100,
        formula: {
          flatNaira: config.flatKobo / 100,
          percentagePct: config.percentageBps / 100,
          capNaira: config.capKobo ? config.capKobo / 100 : 'no cap',
          minimumNaira: config.minimumKobo ? config.minimumKobo / 100 : 'no minimum',
        },
        configScope: config.schoolId ? `school-specific (${config.schoolId})` : 'global default',
        description: config.description,
      },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific config by ID' })
  async getOne(@Param('id') id: string, @Res() res: Response) {
    const data = await this.svc.getConfigById(id);
    return res.status(HttpStatus.OK).json({ statusCode: 200, data });
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new platform charge config',
    description: `
      Examples:
        Flat ₦500:           { flatKobo: 50000, percentageBps: 0 }
        1% of transaction:   { flatKobo: 0, percentageBps: 100 }
        ₦200 + 0.5%:        { flatKobo: 20000, percentageBps: 50 }
        0.5% capped at ₦2k: { flatKobo: 0, percentageBps: 50, capKobo: 200000 }
        School override:     { schoolId: "uuid", flatKobo: 30000, percentageBps: 0 }

      Creating a new active config for a scope (global or school) automatically
      deactivates the previous active config for that scope.
    `,
  })
  async create(@Body() dto: CreatePlatformConfigDto, @Res() res: Response) {
    const data = await this.svc.createConfig(dto);
    return res.status(HttpStatus.CREATED).json({ statusCode: 201, data });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a config (e.g. change the flat fee or percentage)' })
  async update(@Param('id') id: string, @Body() dto: UpdatePlatformConfigDto, @Res() res: Response) {
    const data = await this.svc.updateConfig(id, dto);
    return res.status(HttpStatus.OK).json({ statusCode: 200, data });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a config (must not be the only active config)' })
  async remove(@Param('id') id: string, @Res() res: Response) {
    const data = await this.svc.deleteConfig(id);
    return res.status(HttpStatus.OK).json({ statusCode: 200, data });
  }

  @Post('cache/invalidate')
  @ApiOperation({ summary: 'Force-clear the in-memory config cache (useful after bulk updates)' })
  async invalidateCache(@Query('schoolId') schoolId: string | undefined, @Res() res: Response) {
    this.svc.invalidateCache(schoolId ?? null);
    return res.status(HttpStatus.OK).json({ statusCode: 200, message: 'Cache invalidated' });
  }
}


