import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Bypass self-signed certificate verification for Supabase/Postgres
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
      // When using Supabase's pgbouncer pooler, the pooler manages connections
      // server-side — no need to cap max here. Keep timeouts generous.
      connectionTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
    });

    pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle pg client', err.message);
    });

    const adapter = new PrismaPg(pool as any);
    super({ adapter } as any);
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected');
    } catch (error) {
      this.logger.error('Failed to connect to database', error.message);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
