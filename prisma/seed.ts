
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Bypass self-signed certificate verification
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  console.log('🌱 Starting seeding...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  const adapter = new PrismaPg(pool as any);
  const prisma = new PrismaClient({ adapter } as any);

  try {
    // Default super admin credentials
    const DEFAULT_SUPER_ADMIN_EMAIL = process.env.DEFAULT_SUPER_ADMIN_EMAIL || 'superadmin@example.com';
    const DEFAULT_SUPER_ADMIN_PASSWORD = process.env.DEFAULT_SUPER_ADMIN_PASSWORD || 'changeme123';
    const DEFAULT_SUPER_ADMIN_FIRST_NAME = process.env.DEFAULT_SUPER_ADMIN_FIRST_NAME || 'Super';
    const DEFAULT_SUPER_ADMIN_LAST_NAME = process.env.DEFAULT_SUPER_ADMIN_LAST_NAME || 'Admin';

    // Check if super admin already exists
    const existingSuperAdmin = await prisma.superAdmin.findUnique({
      where: { email: DEFAULT_SUPER_ADMIN_EMAIL }
    });

    if (existingSuperAdmin) {
      console.log('✅ Super admin already exists, skipping creation');
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(DEFAULT_SUPER_ADMIN_PASSWORD, 12);

    // Create super admin
    const superAdmin = await prisma.superAdmin.create({
      data: {
        email: DEFAULT_SUPER_ADMIN_EMAIL,
        password: hashedPassword,
        firstName: DEFAULT_SUPER_ADMIN_FIRST_NAME,
        lastName: DEFAULT_SUPER_ADMIN_LAST_NAME,
        roles: ['SUPER_ADMIN']
      }
    });

    console.log('✅ Super admin created successfully!');
    console.log('📧 Email:', DEFAULT_SUPER_ADMIN_EMAIL);
    console.log('🔑 Password:', DEFAULT_SUPER_ADMIN_PASSWORD);
    console.log('⚠️  Please change the password immediately after logging in!');
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  });
