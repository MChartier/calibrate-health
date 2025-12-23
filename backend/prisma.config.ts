import 'dotenv/config';

import { defineConfig } from 'prisma/config';

/**
 * Read the DATABASE_URL from the environment, throwing a clear error when missing.
 *
 * Prisma CLI commands like `prisma migrate deploy` require a datasource URL and will otherwise fail with
 * a confusing config validation error.
 */
function getRequiredDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Create backend/.env (copy from backend/.env.example) or export DATABASE_URL before running Prisma commands.'
    );
  }
  return databaseUrl;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    // Seed command used by `prisma db seed` (dev/test convenience only).
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: { url: getRequiredDatabaseUrl() },
});
