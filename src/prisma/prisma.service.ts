import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Bypass self-signed certificate verification for Supabase/Postgres
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      },
      max: 20, // Increase max connections
      connectionTimeoutMillis: 60000, // Increase connection timeout to 60s for stability
      idleTimeoutMillis: 30000, // Keep idle timeout at 30s
      keepAlive: true, // Keep connection alive
      statement_timeout: 60000, // Fail queries after 60s
      query_timeout: 60000, // Fail queries after 60s
    });

    pool.on('connect', (client) => {
      this.logger.debug('New client connected to the pool');
    });

    pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle pg client', err.message);
    });

    pool.on('acquire', (client) => {
      this.logger.debug('Client acquired from the pool');
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