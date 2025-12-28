import 'dotenv/config';

import { defineConfig } from 'prisma/config';

/**
 * Read the DATABASE_URL from the environment, throwing a clear error when missing.
 *
 * Prisma client generation does not require a live database connection, but it still needs a
 * syntactically-valid datasource URL to build the generated client types. CI runs unit tests
 * without provisioning Postgres, so we fall back to a placeholder URL for `prisma generate` (and
 * other schema-only commands).
 *
 * Prisma CLI commands like `prisma migrate deploy` require a datasource URL and will otherwise fail with
 * a confusing config validation error.
 */
function getDatabaseUrlForPrisma(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    const argv = process.argv.map((arg) => arg.toLowerCase());
    const schemaOnlyCommands = new Set(['generate', 'format', 'validate']);
    const isSchemaOnlyCommand = argv.some((arg) => schemaOnlyCommands.has(arg));
    if (isSchemaOnlyCommand) {
      // Prisma does not connect during `generate`, but it does validate that the datasource URL exists.
      return 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
    }

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
  datasource: { url: getDatabaseUrlForPrisma() },
});
