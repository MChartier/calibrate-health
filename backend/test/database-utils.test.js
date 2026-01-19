const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveDatabaseUrl,
  resolvePrismaSchema,
  buildPgOptionsForSchema,
  parseDatabaseUrlToPgConfig,
  resolvePgSslConfig
} = require('../src/config/databaseUtils');

test('resolveDatabaseUrl prefers DATABASE_URL when present', () => {
  const env = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/app?schema=public&sslmode=require'
  };

  assert.equal(resolveDatabaseUrl(env), env.DATABASE_URL);
});

test('resolveDatabaseUrl composes from DB_* variables and encodes values', () => {
  const env = {
    DB_HOST: 'db.example.com',
    DB_PORT: '5434',
    DB_NAME: 'calorie tracker',
    DB_USER: 'user@name',
    DB_PASSWORD: 'p@ss word',
    DB_SSLMODE: 'verify-full',
    DB_SCHEMA: 'health-data'
  };

  const expected =
    'postgresql://user%40name:p%40ss%20word@db.example.com:5434/calorie%20tracker?schema=health-data&sslmode=verify-full';

  assert.equal(resolveDatabaseUrl(env), expected);
});

test('resolveDatabaseUrl throws when required DB_* values are missing', () => {
  assert.throws(
    () => resolveDatabaseUrl({ DB_HOST: 'db.internal' }),
    /missing: DB_NAME, DB_USER, DB_PASSWORD/
  );
});

test('resolvePrismaSchema prefers the URL schema and warns on mismatch', () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);

  try {
    const schema = resolvePrismaSchema('postgresql://user:pass@localhost:5432/app?schema=private', {
      DB_SCHEMA: 'public'
    });

    assert.equal(schema, 'private');
    assert.equal(warnings.length, 1);
    assert.match(
      warnings[0],
      /DATABASE_URL schema \(private\) does not match DB_SCHEMA \(public\); using DATABASE_URL value\./
    );
  } finally {
    console.warn = originalWarn;
  }
});

test('resolvePrismaSchema falls back to DB_SCHEMA when URL is invalid', () => {
  const schema = resolvePrismaSchema('not-a-url', { DB_SCHEMA: 'private' });
  assert.equal(schema, 'private');
});

test('buildPgOptionsForSchema returns search_path config with quoting', () => {
  assert.deepEqual(buildPgOptionsForSchema(undefined), {});
  assert.deepEqual(buildPgOptionsForSchema('public'), { options: '-c search_path=public' });
  assert.deepEqual(buildPgOptionsForSchema('app_data'), { options: '-c search_path=app_data,public' });
  assert.deepEqual(buildPgOptionsForSchema('app-data'), { options: '-c search_path="app-data",public' });
});

test('parseDatabaseUrlToPgConfig decodes URL components', () => {
  const config = parseDatabaseUrlToPgConfig('postgresql://user:p%40ss@localhost:5433/app_db');

  assert.deepEqual(config, {
    host: 'localhost',
    port: 5433,
    database: 'app_db',
    user: 'user',
    password: 'p@ss'
  });
});

test('parseDatabaseUrlToPgConfig rejects invalid URLs or protocols', () => {
  assert.throws(
    () => parseDatabaseUrlToPgConfig('not-a-url'),
    /DATABASE_URL is not a valid URL/
  );
  assert.throws(
    () => parseDatabaseUrlToPgConfig('mysql://user:pass@localhost:5432/app'),
    /DATABASE_URL must use the postgres protocol/
  );
});

test('resolvePgSslConfig maps sslmode values', () => {
  assert.equal(resolvePgSslConfig('postgresql://localhost/app', { DB_SSLMODE: 'disable' }), false);
  assert.deepEqual(resolvePgSslConfig('postgresql://localhost/app', { DB_SSLMODE: 'require' }), {
    rejectUnauthorized: false
  });
  assert.equal(resolvePgSslConfig('postgresql://localhost/app', { DB_SSLMODE: 'verify-full' }), true);
  assert.deepEqual(
    resolvePgSslConfig('postgresql://localhost/app?sslmode=require', {}),
    { rejectUnauthorized: false }
  );
  assert.equal(resolvePgSslConfig('postgresql://localhost/app', {}), undefined);
});
