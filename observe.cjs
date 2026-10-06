const { execFileSync } = require('node:child_process');
const { createRequire, Module } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const repo = path.resolve(process.argv[2]);
const req = createRequire(path.join(repo, 'backend/package.json'));
const ts = req('typescript');
const parent = '75578e5ac57a05ba0f06146598b314a01eafb2ae';
const head = '7892c7a8193c5e64c37e92a06e3e0fd360de9a43';
const sourcePath = 'backend/src/config/databaseUtils.ts';
function read(revision) {
  const source = execFileSync('git', ['show', `${revision}:${sourcePath}`], { cwd: repo, encoding: 'utf8' });
  const mod = new Module(path.join(repo, sourcePath));
  mod.filename = path.join(repo, sourcePath);
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, mod.filename);
  return { api: mod.exports, sha256: crypto.createHash('sha256').update(source).digest('hex') };
}
const env = { DATABASE_URL: 'postgresql://synthetic:synthetic@localhost/app?sslmode=disable', DB_POOL_MAX: '3', DB_POOL_ACQUIRE_TIMEOUT_SECONDS: '5', DB_POOL_IDLE_TIMEOUT_SECONDS: '30' };
const before = read(parent);
const after = read(head);
const beforeConfig = {
  ...before.api.parseDatabaseUrlToPgConfig(before.api.resolveDatabaseUrl(env)),
  ssl: before.api.resolvePgSslConfig(env.DATABASE_URL, env),
  ...before.api.buildPgOptionsForSchema(before.api.resolvePrismaSchema(env.DATABASE_URL, env))
};
const result = {
  parent, head, sourcePath, sourceHashes: { before: before.sha256, after: after.sha256 },
  environment: { platform: process.platform, node: process.version, pg: req('pg/package.json').version, prisma: req('prisma/package.json').version },
  fixture: env, beforeConfig, after: after.api.resolveDatabaseConnection(env),
  explanation: 'Before uses the exact parent database.ts composition. Opt-in settings are absent there; After supplies max=3, acquisition=5000ms and idle=30000ms, with equivalent CLI URL parameters. No database is contacted.'
};
fs.writeFileSync(path.join(__dirname, 'observation.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
