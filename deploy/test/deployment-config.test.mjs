import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const deployDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(deployDirectory, '..');
const readDeploy = (file) => fs.readFileSync(path.join(deployDirectory, file), 'utf8');

test('Caddy and Traefik share DB-backed app readiness semantics', () => {
  const caddyCompose = readDeploy('docker-compose.yml');
  const traefikCompose = readDeploy('docker-compose.traefik.yml');
  const caddyfile = readDeploy('Caddyfile.prod');
  for (const content of [caddyCompose, traefikCompose, caddyfile]) {
    assert.match(content, /\/api\/v1\/readyz/);
  }
  assert.match(caddyCompose, /condition: service_healthy/);
  assert.match(traefikCompose, /loadbalancer\.healthcheck\.path=\/api\/v1\/readyz/);
  assert.match(caddyfile, /\{\$APP_HOST\}/);
  assert.doesNotMatch(caddyfile, /calibratehealth\.app/);
});

test('in-stack Postgres remains private and gates app startup on DB health', () => {
  const postgres = readDeploy('docker-compose.postgres.yml');
  assert.match(postgres, /pg_isready/);
  assert.match(postgres, /condition: service_healthy/);
  assert.match(postgres, /postgres_data:\/var\/lib\/postgresql\/data/);
  assert.doesNotMatch(postgres, /ports:/);
  assert.match(postgres, /DB_SSLMODE: disable/);
});

test('backup pipeline encrypts before promotion and limits retention to completed dumps', () => {
  const backup = readDeploy('backup/backup-postgres.sh');
  assert.match(backup, /pg_dump/);
  assert.match(backup, /age --encrypt --recipient/);
  assert.match(backup, /\.dump\.age/);
  assert.match(backup, /\.partial/);
  assert.match(backup, /BACKUP_RETENTION_DAYS/);
  assert.match(backup, /-name 'calibrate-\*\.dump\.age'/);
  assert.match(backup, /trap cleanup EXIT INT TERM HUP/);
  assert.ok(backup.indexOf('age --encrypt') < backup.indexOf('mv "$partial" "$destination"'));
});

test('restore refuses accidental destructive use and never writes a plaintext dump to the backup volume', () => {
  const restore = readDeploy('backup/restore-postgres.sh');
  assert.match(restore, /CONFIRM_RESTORE_TO_EMPTY_DATABASE/);
  assert.match(restore, /target database contains/);
  assert.match(restore, /pg_restore --list/);
  assert.match(restore, /--exit-on-error/);
  assert.doesNotMatch(restore, /--clean/);
  assert.doesNotMatch(restore, />\s*\/backups\/.*\.dump(?!\.age)/);
});

test('production startup retries migrations before opening the app process', () => {
  const startup = fs.readFileSync(path.join(repositoryRoot, 'backend/scripts/start-prod.sh'), 'utf8');
  assert.match(startup, /MIGRATION_MAX_ATTEMPTS/);
  assert.match(startup, /until npm run db:migrate/);
  assert.ok(startup.indexOf('until npm run db:migrate') < startup.indexOf('exec npm run start'));
});

test('deployment remains portable and does not restore removed cloud infrastructure', () => {
  const deploymentText = fs.readdirSync(deployDirectory, { recursive: true })
    .filter((entry) => typeof entry === 'string')
    .join('\n');
  assert.doesNotMatch(deploymentText, /terraform|cloudformation/i);
  assert.equal(fs.existsSync(path.join(repositoryRoot, 'terraform')), false);
});
