import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolConfig } from 'pg';

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

type PgSslConfig = PoolConfig['ssl'];

type PgConnectionConfig = Pick<PoolConfig, 'host' | 'port' | 'database' | 'user' | 'password'>;

/**
 * Resolve the Prisma schema name for the current connection.
 *
 * Prisma models live in a specific Postgres schema selected via the `schema` query param
 * (or DB_SCHEMA when we compose DATABASE_URL). When using driver adapters we need to pass
 * the schema explicitly to the adapter; it is not derived from the pg Pool config.
 */
function resolvePrismaSchema(databaseUrl: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const envSchemaRaw = env.DB_SCHEMA?.trim();
  const envSchema = envSchemaRaw ? envSchemaRaw : undefined;

  let urlSchema: string | undefined;
  try {
    urlSchema = new URL(databaseUrl).searchParams.get('schema')?.trim() || undefined;
  } catch {
    urlSchema = undefined;
  }

  if (urlSchema && envSchema && urlSchema !== envSchema) {
    console.warn(
      `DATABASE_URL schema (${urlSchema}) does not match DB_SCHEMA (${envSchema}); using DATABASE_URL value.`
    );
  }

  return urlSchema ?? envSchema;
}

/**
 * Parse a Postgres connection string into discrete node-postgres connection fields.
 *
 * We intentionally avoid passing `connectionString` to node-postgres because query params like
 * `sslmode=require` overwrite the explicit `ssl` config we need for RDS compatibility.
 *
 * Note: Query params are not forwarded to pg (except via explicit config elsewhere). For Prisma,
 * the `schema` param is handled separately via the adapter options (see resolvePrismaSchema).
 */
function parseDatabaseUrlToPgConfig(databaseUrl: string): PgConnectionConfig {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`DATABASE_URL is not a valid URL (${message}).`);
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`DATABASE_URL must use the postgres protocol (received "${url.protocol}").`);
  }

  const host = url.hostname;
  const port = url.port ? Number.parseInt(url.port, 10) : undefined;
  const databasePath = url.pathname.replace(/^\/+/, '');

  return {
    host: host || undefined,
    port: port && Number.isFinite(port) ? port : undefined,
    database: databasePath ? decodeURIComponent(databasePath) : undefined,
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined
  };
}

/**
 * Translate Postgres `sslmode` values into node-postgres SSL options.
 *
 * libpq treats `sslmode=require` as "encrypt the connection, but do not verify
 * certificates". node-postgres verifies by default when SSL is enabled, which
 * can fail against RDS unless you provide the RDS CA bundle. For `require` we
 * intentionally disable verification to match libpq semantics.
 */
function resolvePgSslConfig(databaseUrl: string, env: NodeJS.ProcessEnv = process.env): PgSslConfig | undefined {
  const sslmodeRaw =
    env.DB_SSLMODE ?? (() => {
      try {
        return new URL(databaseUrl).searchParams.get('sslmode') ?? undefined;
      } catch {
        return undefined;
      }
    })();

  if (!sslmodeRaw) return undefined;

  const sslmode = String(sslmodeRaw).trim().toLowerCase();
  if (!sslmode || sslmode === 'disable') return false;

  if (sslmode === 'require') {
    return { rejectUnauthorized: false };
  }

  // For verify-ca/verify-full/etc, fall back to pg's default verification behavior.
  return true;
}

const pool = new Pool({ ...parseDatabaseUrlToPgConfig(databaseUrl), ssl: resolvePgSslConfig(databaseUrl) });
const adapter = new PrismaPg(pool, { schema: resolvePrismaSchema(databaseUrl) });

const prisma = new PrismaClient({ adapter });

export default prisma;
