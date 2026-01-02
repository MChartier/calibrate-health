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
  if (databaseUrl) return databaseUrl;

  const argv = process.argv.map((arg) => arg.toLowerCase());
  const schemaOnlyCommands = new Set(['generate', 'format', 'validate']);
  const isSchemaOnlyCommand = argv.some((arg) => schemaOnlyCommands.has(arg));
  if (isSchemaOnlyCommand) {
    // Prisma does not connect during `generate`, but it does validate that the datasource URL exists.
    return 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
  }

  return composeDatabaseUrlFromDbEnv();
}

/**
 * Compose a Postgres connection string from DB_* environment variables.
 *
 * ECS-hosted deployments inject DB host/name as plaintext and DB credentials as secrets, avoiding
 * the need to store a full DATABASE_URL string in Secrets Manager.
 */
function composeDatabaseUrlFromDbEnv(): string {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? '5432';
  const dbName = process.env.DB_NAME;
  const username = process.env.DB_USER ?? process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD ?? process.env.DB_PASS;
  const sslmode = process.env.DB_SSLMODE ?? 'require';
  const schema = process.env.DB_SCHEMA ?? 'public';

  const missing: string[] = [];
  if (!host) missing.push('DB_HOST');
  if (!dbName) missing.push('DB_NAME');
  if (!username) missing.push('DB_USER');
  if (!password) missing.push('DB_PASSWORD');

  if (missing.length > 0) {
    throw new Error(
      `DATABASE_URL is required for Prisma commands. Provide DATABASE_URL directly (e.g. via backend/.env) or set DB_* env vars so we can compose it (missing: ${missing.join(', ')}).`
    );
  }

  const encodedUser = encodeURIComponent(username);
  const encodedPass = encodeURIComponent(password);
  const encodedDbName = encodeURIComponent(dbName);
  const encodedSchema = encodeURIComponent(schema);
  const encodedSslMode = encodeURIComponent(sslmode);

  return `postgresql://${encodedUser}:${encodedPass}@${host}:${port}/${encodedDbName}?schema=${encodedSchema}&sslmode=${encodedSslMode}`;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    // Seed command used by `prisma db seed` (dev/test convenience only).
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: { url: getDatabaseUrlForPrisma() },
});
