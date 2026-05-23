
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const assignments = await (prisma as any).assignment.findMany({ take: 1 });
    console.log('Successfully queried assignments table');
    if (assignments && assignments.length > 0) {
      console.log('Columns:', Object.keys(assignments[0]));
    } else {
      console.log('No assignments found, but table exists.');
    }
  } catch (error: any) {
    console.error('Error querying assignments:', error.message || error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
