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

export default prisma;
