import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * Resolve the Prisma/pg connection string for the current runtime.
 *
 * Local development prefers `DATABASE_URL` directly (via `.env`). For hosted
 * runtimes like ECS we often inject DB components (host/user/password/name) as
 * separate environment variables, so we can compose a URL without storing the
 * full connection string as a secret.
 */
function resolveDatabaseUrl(): string {
  const directUrl = process.env.DATABASE_URL;
  if (directUrl) return directUrl;

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? '5432';
  const dbName = process.env.DB_NAME;
  const username = process.env.DB_USER ?? process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD ?? process.env.DB_PASS;
  const sslmode = process.env.DB_SSLMODE ?? 'require';
  const schema = process.env.DB_SCHEMA ?? 'public';

  if (!host || !dbName || !username || !password) {
    const missing: string[] = [];
    if (!host) missing.push('DB_HOST');
    if (!dbName) missing.push('DB_NAME');
    if (!username) missing.push('DB_USER');
    if (!password) missing.push('DB_PASSWORD');

    throw new Error(
      `DATABASE_URL is not set and could not be composed (missing: ${missing.join(', ')}).`
    );
  }

  const encodedUser = encodeURIComponent(username);
  const encodedPass = encodeURIComponent(password);
  const encodedDbName = encodeURIComponent(dbName);
  const encodedSchema = encodeURIComponent(schema);
  const encodedSslMode = encodeURIComponent(sslmode);

  return `postgresql://${encodedUser}:${encodedPass}@${host}:${port}/${encodedDbName}?schema=${encodedSchema}&sslmode=${encodedSslMode}`;
}

const databaseUrl = resolveDatabaseUrl();

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export default prisma;
