import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreatePlatformConfigDto,
  UpdatePlatformConfigDto,
} from './dto/platform-config.dto';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — changes reflect quickly without hammering DB
const FALLBACK_FLAT_KOBO = 50_000; // ₦500 hardcoded fallback

export interface PlatformChargeConfig {
  id: string;
  schoolId: string | null; // null = global default
  flatKobo: number;
  percentageBps: number; // basis points: 100 = 1%
  capKobo: number; // 0 = no cap
  minimumKobo: number; // 0 = no minimum
  description: string;
  isActive: boolean;
}

export interface ChargeBreakdown {
  principalKobo: number;
  platformFlatKobo: number;
  platformPercentKobo: number;
  platformTotalKobo: number; // what you earn
  gatewayFeeKobo: number; // what processor earns
  studentPaysKobo: number; // total charged to student
  schoolReceivesKobo: number; // what school gets net of gateway fee
}

@Injectable()
export class PlatformConfigService {
  private readonly logger = new Logger(PlatformConfigService.name);

  // In-memory cache: key = schoolId (or '__global__' for default)
  private cache = new Map<
    string,
    { config: PlatformChargeConfig; expiresAt: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  // ─── Charge calculation ────────────────────────────────────────────────────

  async calculatePlatformCharge(
    principalKobo: number,
    schoolId: string,
  ): Promise<number> {
    const config = await this.getEffectiveConfig(schoolId);
    return this.applyChargeFormula(principalKobo, config);
  }

  applyChargeFormula(
    principalKobo: number,
    config: PlatformChargeConfig,
  ): number {
    const flat = config.flatKobo;
    const pct = Math.ceil((principalKobo * config.percentageBps) / 10_000);
    let total = flat + pct;

    if (config.capKobo > 0) total = Math.min(total, config.capKobo);
    if (config.minimumKobo > 0) total = Math.max(total, config.minimumKobo);

    return total;
  }

  // Returns the full charge breakdown for display and DB storage
  async buildChargeBreakdown(
    principalKobo: number,
    gatewayFeeKobo: number,
    schoolId: string,
    absorbGateway: boolean,
  ): Promise<ChargeBreakdown> {
    const config = await this.getEffectiveConfig(schoolId);
    const flat = config.flatKobo;
    const pct = Math.ceil((principalKobo * config.percentageBps) / 10_000);
    let platformTotal = flat + pct;
    if (config.capKobo > 0)
      platformTotal = Math.min(platformTotal, config.capKobo);
    if (config.minimumKobo > 0)
      platformTotal = Math.max(platformTotal, config.minimumKobo);

    const studentPaysKobo =
      principalKobo + platformTotal + (absorbGateway ? 0 : gatewayFeeKobo);

    const schoolReceivesKobo =
      principalKobo + platformTotal - (absorbGateway ? gatewayFeeKobo : 0);

    return {
      principalKobo,
      platformFlatKobo: flat,
      platformPercentKobo: pct,
      platformTotalKobo: platformTotal,
      gatewayFeeKobo,
      studentPaysKobo,
      schoolReceivesKobo,
    };
  }

  // ─── Config lookup with cache ────────────────────────────────

  async getEffectiveConfig(schoolId: string): Promise<PlatformChargeConfig> {
    // 1. Check school-specific cache
    const schoolCached = this.cache.get(schoolId);
    if (schoolCached && schoolCached.expiresAt > Date.now()) {
      return schoolCached.config;
    }

    // 2. Try school-specific DB record
    const schoolConfig = await (this.prisma as any).platformConfig.findFirst({
      where: { schoolId, isActive: true },
    });

    if (schoolConfig) {
      const config = this.mapToConfig(schoolConfig);
      this.cache.set(schoolId, {
        config,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return config;
    }

    // 3. Check global cache
    const globalCached = this.cache.get('__global__');
    if (globalCached && globalCached.expiresAt > Date.now()) {
      return globalCached.config;
    }

    // 4. Try global DB record
    const globalConfig = await (this.prisma as any).platformConfig.findFirst({
      where: { schoolId: null, isActive: true },
    });

    if (globalConfig) {
      const config = this.mapToConfig(globalConfig);
      this.cache.set('__global__', {
        config,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return config;
    }

    // 5. Hardcoded fallback (logs a warning — super-admin should set a config)
    this.logger.warn(
      'No platform config found in DB — using hardcoded fallback of ₦500 flat',
    );
    return {
      id: 'fallback',
      schoolId: null,
      flatKobo: FALLBACK_FLAT_KOBO,
      percentageBps: 0,
      capKobo: 0,
      minimumKobo: 0,
      description: 'Hardcoded fallback',
      isActive: true,
    };
  }

  // ─── Admin CRUD ────────────────────────────────

  async createConfig(
    dto: CreatePlatformConfigDto,
  ): Promise<PlatformChargeConfig> {
    this.validateConfigDto(dto);

    // If creating a new active config for this scope, deactivate the old one
    if (dto.isActive !== false) {
      await (this.prisma as any).platformConfig.updateMany({
        where: { schoolId: dto.schoolId ?? null, isActive: true },
        data: { isActive: false },
      });
    }

    const record = await (this.prisma as any).platformConfig.create({
      data: {
        schoolId: dto.schoolId ?? null,
        flatKobo: dto.flatKobo ?? 0,
        percentageBps: dto.percentageBps ?? 0,
        capKobo: dto.capKobo ?? 0,
        minimumKobo: dto.minimumKobo ?? 0,
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });

    this.invalidateCache(dto.schoolId ?? null);
    return this.mapToConfig(record);
  }

  async updateConfig(
    id: string,
    dto: UpdatePlatformConfigDto,
  ): Promise<PlatformChargeConfig> {
    const existing = await (this.prisma as any).platformConfig.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Platform config not found');

    if (dto.flatKobo !== undefined || dto.percentageBps !== undefined) {
      this.validateConfigDto({ ...existing, ...dto });
    }

    // If activating this config, deactivate others in same scope
    if (dto.isActive === true) {
      await (this.prisma as any).platformConfig.updateMany({
        where: { schoolId: existing.schoolId, isActive: true, id: { not: id } },
        data: { isActive: false },
      });
    }

    const updated = await (this.prisma as any).platformConfig.update({
      where: { id },
      data: { ...dto, updatedAt: new Date() },
    });

    this.invalidateCache(existing.schoolId);
    return this.mapToConfig(updated);
  }

  async listConfigs(schoolId?: string | null) {
    return (this.prisma as any).platformConfig.findMany({
      where: schoolId !== undefined ? { schoolId } : undefined,
      orderBy: [{ schoolId: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getConfigById(id: string) {
    const config = await (this.prisma as any).platformConfig.findUnique({
      where: { id },
    });
    if (!config) throw new NotFoundException('Platform config not found');
    return config;
  }

  async deleteConfig(id: string) {
    const existing = await (this.prisma as any).platformConfig.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Platform config not found');
    await (this.prisma as any).platformConfig.delete({ where: { id } });
    this.invalidateCache(existing.schoolId);
    return { deleted: true };
  }

  // Force-refresh cache for a specific scope (useful after admin update)
  invalidateCache(schoolId: string | null) {
    if (schoolId) this.cache.delete(schoolId);
    this.cache.delete('__global__');
    this.logger.log(`Cache invalidated for scope: ${schoolId ?? 'global'}`);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private mapToConfig(record: any): PlatformChargeConfig {
    return {
      id: record.id,
      schoolId: record.schoolId,
      flatKobo: record.flatKobo,
      percentageBps: record.percentageBps,
      capKobo: record.capKobo,
      minimumKobo: record.minimumKobo,
      description: record.description,
      isActive: record.isActive,
    };
  }

  private validateConfigDto(dto: Partial<CreatePlatformConfigDto>) {
    if ((dto.flatKobo ?? 0) === 0 && (dto.percentageBps ?? 0) === 0) {
      throw new BadRequestException(
        'Platform config must have either a flat fee or a percentage (or both)',
      );
    }
    if ((dto.percentageBps ?? 0) > 10_000) {
      throw new BadRequestException('percentageBps cannot exceed 10000 (100%)');
    }
  }
}
