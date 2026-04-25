import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  buildPgOptionsForSchema,
  parseDatabaseUrlToPgConfig,
  resolveDatabaseUrl,
  resolvePgSslConfig,
  resolvePrismaSchema
} from './databaseUtils';

const databaseUrl = resolveDatabaseUrl();

const prismaSchema = resolvePrismaSchema(databaseUrl);

export const pgPool = new Pool({
  ...parseDatabaseUrlToPgConfig(databaseUrl),
  ssl: resolvePgSslConfig(databaseUrl),
  ...buildPgOptionsForSchema(prismaSchema),
});
const adapter = new PrismaPg(pgPool, { schema: prismaSchema });

const prisma = new PrismaClient({ adapter });

/**
 * Close both Prisma and the owned node-postgres pool used by the Prisma adapter.
 *
 * Prisma does not own the pg Pool lifecycle when a driver adapter is supplied, so
 * short-lived CLI scripts must close both handles or Node waits for the pool idle timeout.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  await pgPool.end();
}

export default prisma;
