const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('operator grant rejects missing or malformed identity before loading a database connection', () => {
  for (const args of [[], ['--email', 'not-an-email'], ['--id', '2147483648']]) {
    const result = spawnSync(process.execPath, [
      '-r', 'ts-node/register', 'src/scripts/grantServerAdmin.ts', ...args
    ], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        DOTENV_CONFIG_PATH: path.join(__dirname, 'fixtures/nonexistent-env'),
        DATABASE_URL: '', DB_HOST: '', DB_NAME: '', DB_USER: '', DB_PASSWORD: ''
      }
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Usage: admin:grant/);
    assert.doesNotMatch(result.stderr, /Could not grant|DATABASE_URL|Prisma|password_hash/);
    assert.equal(result.stdout, '');
  }
});
