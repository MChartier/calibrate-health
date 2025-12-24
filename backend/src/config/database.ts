import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

export const pgPool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pgPool);

const prisma = new PrismaClient({ adapter });

export default prisma;
