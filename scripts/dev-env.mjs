#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRequire = createRequire(path.join(repoRoot, "backend", "package.json"));
const DEV_SEED_USER_EMAIL = "test@calibratehealth.app";
const INSTALL_STALE_LOCK_MS = 20 * 60 * 1000;
const INSTALL_LOCK_RETRY_MS = 2000;
const INSTALL_LOCK_LOG_MS = 10000;
const DATABASE_WAIT_TIMEOUT_MS = 120000;
const DATABASE_WAIT_RETRY_MS = 2000;

const packages = [
  {
    name: "backend",
    directory: path.join(repoRoot, "backend"),
    installArgs: ["ci", "--prefer-offline", "--no-audit", "--fund=false"],
  },
  {
    name: "frontend",
    directory: path.join(repoRoot, "frontend"),
    installArgs: [
      "ci",
      "--legacy-peer-deps",
      "--prefer-offline",
      "--no-audit",
      "--fund=false",
    ],
  },
];
const packageLockHashCache = new Map();
let cachedNpmVersion = null;

/**
 * Run a subprocess and inherit stdio so Codex actions show useful logs.
 * @param {string} command - Executable to run.
 * @param {string[]} args - Command arguments.
 * @param {{ cwd?: string }} options - Spawn options.
 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/**
 * Run a subprocess asynchronously and inherit stdio so parallel setup work can overlap.
 * @param {string} command - Executable to run.
 * @param {string[]} args - Command arguments.
 * @param {{ cwd?: string }} options - Spawn options.
 * @returns {Promise<void>} Resolves when the command exits successfully.
 */
function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const suffix = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
      reject(new Error(`${command} ${args.join(" ")} failed with ${suffix}.`));
    });
  });
}

/**
 * Run a subprocess, capture output, and return its status.
 * @param {string} command - Executable to run.
 * @param {string[]} args - Command arguments.
 * @param {{ cwd?: string }} options - Spawn options.
 * @returns {{ status: number, output: string }} Exit status and combined output.
 */
function runCaptured(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output) {
    process.stdout.write(output);
  }
  return { status: result.status ?? 1, output };
}

/**
 * Run a command and capture stdout.
 * @param {string} command - Executable to run.
 * @param {string[]} args - Command arguments.
 * @returns {string} Trimmed stdout, or an empty string when unavailable.
 */
function readCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0 || result.error) {
    return "";
  }
  return result.stdout.trim();
}

/**
 * Return the npm version once per process for dependency-cache metadata.
 * @returns {string} npm version, or "unknown-npm" when unavailable.
 */
function npmVersion() {
  if (cachedNpmVersion === null) {
    cachedNpmVersion = readCommand("npm", ["--version"]) || "unknown-npm";
  }

  return cachedNpmVersion;
}

/**
 * Time a setup phase and print a compact duration line.
 * @template T
 * @param {string} label - Phase label.
 * @param {() => T | Promise<T>} task - Work to run.
 * @returns {Promise<T>} Task result.
 */
async function timed(label, task) {
  const startedAt = Date.now();
  console.log(`\n[dev-env] ${label}...`);
  try {
    return await task();
  } finally {
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[dev-env] ${label} finished in ${elapsedSeconds}s`);
  }
}

/**
 * Print a high-signal completion marker for Codex action output.
 * @param {string} message - Completion message.
 */
function printDone(message) {
  console.log(`\n[dev-env] DONE: ${message}`);
}

/**
 * Sleep for a short retry interval.
 * @param {number} ms - Milliseconds to sleep.
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Hash a package lockfile so dependency caches follow lockfile changes.
 * @param {string} packageDirectory - Package directory.
 * @returns {string} Short hash for the package lock.
 */
function packageLockHash(packageDirectory) {
  const cached = packageLockHashCache.get(packageDirectory);
  if (cached) {
    return cached;
  }

  const lockPath = path.join(packageDirectory, "package-lock.json");
  const manifestPath = path.join(packageDirectory, "package.json");
  const hash = crypto.createHash("sha256");

  if (fs.existsSync(lockPath)) {
    hash.update(fs.readFileSync(lockPath));
  } else if (fs.existsSync(manifestPath)) {
    hash.update(fs.readFileSync(manifestPath));
  }

  hash.update(process.versions.node.split(".")[0]);
  hash.update(npmVersion().split(".")[0] || "unknown-npm");
  const digest = hash.digest("hex").slice(0, 16);
  packageLockHashCache.set(packageDirectory, digest);
  return digest;
}

/**
 * Return the install sentinel path for a package.
 * @param {string} packageDirectory - Package directory.
 * @returns {string} Sentinel path.
 */
function installSentinelPath(packageDirectory) {
  return path.join(packageDirectory, "node_modules", ".calibrate-install-complete.json");
}

/**
 * Return the package's shared node_modules volume mount path.
 * @param {string} packageDirectory - Package directory.
 * @returns {string} node_modules path.
 */
function nodeModulesPath(packageDirectory) {
  return path.join(packageDirectory, "node_modules");
}

/**
 * Read the dependency install sentinel from a shared node_modules volume.
 * @param {string} packageDirectory - Package directory.
 * @returns {Record<string, unknown> | null} Sentinel data when present and valid.
 */
function readInstallSentinel(packageDirectory) {
  const sentinelPath = installSentinelPath(packageDirectory);
  if (!fs.existsSync(sentinelPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(sentinelPath, "utf8"));
  } catch (error) {
    return null;
  }
}

/**
 * Return the install lock directory for a package.
 * @param {string} packageDirectory - Package directory.
 * @returns {string} Lock directory path.
 */
function installLockDirectory(packageDirectory) {
  const packageName = path.basename(packageDirectory);
  const cacheRoot = process.env.npm_config_cache || path.join(os.homedir(), ".npm");
  return path.join(
    cacheRoot,
    "_calibrate-dev-env-locks",
    `${packageName}-${packageLockHash(packageDirectory)}.lock`
  );
}

/**
 * Repair stale shared-volume ownership before npm removes existing files.
 *
 * Older setup flows and failed installs can leave root-owned files in a shared
 * node_modules volume. On an install cache miss, npm ci needs to unlink those
 * files, so fix ownership only on the cold/stale path and leave cache hits fast.
 * @param {{ name: string, directory: string }} packageConfig - Package config.
 */
function repairDependencyVolumeOwnership(packageConfig) {
  if (process.platform === "win32") {
    return;
  }

  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  const gid = typeof process.getgid === "function" ? process.getgid() : null;
  if (uid === null || gid === null) {
    return;
  }

  const nodeModulesDirectory = nodeModulesPath(packageConfig.directory);
  fs.mkdirSync(nodeModulesDirectory, { recursive: true });

  console.log(`[dev-env] Repairing ${packageConfig.name} node_modules volume ownership before install.`);
  const chownCommand = uid === 0 ? "chown" : "sudo";
  const chownArgs =
    uid === 0
      ? ["-R", `${uid}:${gid}`, nodeModulesDirectory]
      : ["chown", "-R", `${uid}:${gid}`, nodeModulesDirectory];
  run(chownCommand, chownArgs);
}

/**
 * Check whether a package install is current for this lockfile and runtime.
 * @param {{ name: string, directory: string, installArgs: string[] }} packageConfig - Package config.
 * @returns {boolean} True when install can be skipped.
 */
function hasCurrentInstall(packageConfig) {
  return dependencyInstallStatus(packageConfig).current;
}

/**
 * Describe whether a package's shared node_modules volume matches the current lockfile/runtime.
 * @param {{ name: string, directory: string, installArgs: string[] }} packageConfig - Package config.
 * @returns {{ current: boolean, reason: string }} Install-cache status.
 */
function dependencyInstallStatus(packageConfig) {
  const sentinel = readInstallSentinel(packageConfig.directory);
  if (!sentinel) {
    return {
      current: false,
      reason: "no install sentinel was found in the shared node_modules volume",
    };
  }

  if (sentinel.package !== packageConfig.name) {
    return {
      current: false,
      reason: `install sentinel belongs to ${String(sentinel.package) || "another package"}`,
    };
  }

  const expectedLockHash = packageLockHash(packageConfig.directory);
  if (sentinel.lockHash !== expectedLockHash) {
    return {
      current: false,
      reason: `lockfile/runtime hash changed (${String(sentinel.lockHash) || "missing"} -> ${expectedLockHash})`,
    };
  }

  const expectedCommand = `npm ${packageConfig.installArgs.join(" ")}`;
  if (sentinel.installCommand !== expectedCommand) {
    return {
      current: false,
      reason: `install command changed (${String(sentinel.installCommand) || "missing"} -> ${expectedCommand})`,
    };
  }

  return {
    current: true,
    reason: "shared node_modules volume cache hit",
  };
}

/**
 * Mark a package install as complete for the current lockfile.
 * @param {{ name: string, directory: string, installArgs: string[] }} packageConfig - Package config.
 */
function writeInstallSentinel(packageConfig) {
  const sentinel = {
    package: packageConfig.name,
    lockHash: packageLockHash(packageConfig.directory),
    installCommand: `npm ${packageConfig.installArgs.join(" ")}`,
    node: process.versions.node,
    npm: npmVersion(),
    installedAt: new Date().toISOString(),
  };
  fs.writeFileSync(installSentinelPath(packageConfig.directory), `${JSON.stringify(sentinel, null, 2)}\n`);
}

/**
 * Acquire a package install lock stored inside the shared node_modules volume.
 * @param {{ name: string, directory: string }} packageConfig - Package config.
 * @returns {Promise<() => void>} Release callback.
 */
async function acquireInstallLock(packageConfig) {
  const nodeModulesDirectory = nodeModulesPath(packageConfig.directory);
  const lockDirectory = installLockDirectory(packageConfig.directory);
  fs.mkdirSync(nodeModulesDirectory, { recursive: true });
  fs.mkdirSync(path.dirname(lockDirectory), { recursive: true });

  let lastLogAt = 0;
  while (true) {
    try {
      fs.mkdirSync(lockDirectory);
      fs.writeFileSync(
        path.join(lockDirectory, "owner.json"),
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }, null, 2)}\n`
      );
      return () => {
        fs.rmSync(lockDirectory, { recursive: true, force: true });
      };
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }

      const stats = fs.statSync(lockDirectory);
      const lockAgeMs = Date.now() - stats.mtimeMs;
      if (lockAgeMs > INSTALL_STALE_LOCK_MS) {
        console.warn(`[dev-env] Removing stale ${packageConfig.name} install lock.`);
        fs.rmSync(lockDirectory, { recursive: true, force: true });
        continue;
      }

      if (Date.now() - lastLogAt > INSTALL_LOCK_LOG_MS) {
        console.log(`[dev-env] Waiting for another ${packageConfig.name} install to finish...`);
        lastLogAt = Date.now();
      }
      await sleep(INSTALL_LOCK_RETRY_MS);
    }
  }
}

/**
 * Install one package when its shared node_modules volume is empty or stale.
 * @param {{ name: string, directory: string, installArgs: string[] }} packageConfig - Package config.
 */
async function ensurePackageDependencies(packageConfig) {
  const initialStatus = dependencyInstallStatus(packageConfig);
  if (initialStatus.current) {
    console.log(`[dev-env] ${packageConfig.name} dependencies are current (${initialStatus.reason}).`);
    return;
  }

  console.log(`[dev-env] ${packageConfig.name} dependency cache miss: ${initialStatus.reason}.`);
  const release = await acquireInstallLock(packageConfig);
  try {
    const lockedStatus = dependencyInstallStatus(packageConfig);
    if (lockedStatus.current) {
      console.log(`[dev-env] ${packageConfig.name} dependencies are current (${lockedStatus.reason}).`);
      return;
    }

    repairDependencyVolumeOwnership(packageConfig);
    console.log(`[dev-env] Installing ${packageConfig.name} dependencies: npm ${packageConfig.installArgs.join(" ")}`);
    await runAsync("npm", packageConfig.installArgs, { cwd: packageConfig.directory });
    writeInstallSentinel(packageConfig);
  } finally {
    release();
  }
}

/**
 * Install all app dependencies with shared-volume locking.
 */
async function ensureDependencies() {
  if (process.platform !== "win32" && fs.existsSync(path.join(repoRoot, ".devcontainer", "prepare-volumes.sh"))) {
    await timed("Prepare devcontainer volumes", () => {
      run("bash", [".devcontainer/prepare-volumes.sh"]);
    });
  }

  await timed("Install dependencies", async () => {
    await Promise.all(
      packages.map((packageConfig) =>
        timed(`${packageConfig.name} dependencies`, () => ensurePackageDependencies(packageConfig))
      )
    );
  });
}

/**
 * Run dependency setup as a standalone user action.
 */
async function deps() {
  await ensureDependencies();
  printDone("Dependencies are ready.");
}

/**
 * Generate Prisma client code.
 */
async function generatePrismaClient() {
  await timed("Generate Prisma client", () => {
    run("npm", ["run", "prisma:generate"]);
  });
}

/**
 * Try one TCP connection to the configured database.
 * @param {URL} databaseUrl - Parsed database URL.
 * @returns {Promise<boolean>} True when a connection succeeds.
 */
function canConnectToDatabase(databaseUrl) {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: databaseUrl.hostname,
      port: Number(databaseUrl.port || 5432),
      timeout: 3000,
    });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait for Postgres before running Prisma commands.
 */
async function waitForDatabase() {
  await timed("Wait for database", async () => {
    const rawDatabaseUrl = process.env.DATABASE_URL;
    if (!rawDatabaseUrl) {
      console.warn("[dev-env] DATABASE_URL is not set; skipping database readiness probe.");
      return;
    }

    const databaseUrl = new URL(rawDatabaseUrl);
    const startedAt = Date.now();
    while (Date.now() - startedAt < DATABASE_WAIT_TIMEOUT_MS) {
      if (await canConnectToDatabase(databaseUrl)) {
        return;
      }
      await sleep(DATABASE_WAIT_RETRY_MS);
    }

    throw new Error(`Timed out waiting for database at ${databaseUrl.hostname}:${databaseUrl.port || 5432}.`);
  });
}

/**
 * Apply Prisma migrations and explain the common legacy dev DB failure.
 */
function runMigrateDeploy() {
  const result = runCaptured("npm", ["--prefix", "backend", "run", "db:migrate"]);
  if (result.status === 0) {
    return;
  }

  if (result.output.includes("P3005")) {
    console.error(
      [
        "",
        "[dev-env] Prisma refused to migrate because the database has tables but no migration history.",
        "[dev-env] This commonly happens with disposable dev databases created by the old db push reset flow.",
        "[dev-env] Run `npm run db:reset:dev` or the Codex `Reset DB` action to recreate this worktree database.",
      ].join("\n")
    );
  }

  process.exit(result.status);
}

/**
 * Check whether the deterministic dev seed appears to already exist.
 * @returns {Promise<boolean>} True when the dev seed can be skipped.
 */
async function isDevSeedPresent() {
  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (!rawDatabaseUrl) {
    return false;
  }

  try {
    const { Client } = backendRequire("pg");
    const client = new Client({ connectionString: rawDatabaseUrl });
    await client.connect();
    try {
      const result = await client.query(
        `
          SELECT 1
          FROM "User" u
          WHERE u.email = $1
            AND EXISTS (SELECT 1 FROM "Goal" g WHERE g.user_id = u.id)
            AND EXISTS (SELECT 1 FROM "BodyMetric" m WHERE m.user_id = u.id)
            AND EXISTS (SELECT 1 FROM "FoodLog" f WHERE f.user_id = u.id)
          LIMIT 1
        `,
        [DEV_SEED_USER_EMAIL]
      );
      return result.rowCount > 0;
    } finally {
      await client.end();
    }
  } catch (error) {
    return false;
  }
}

/**
 * Seed the deterministic dev data, optionally skipping when it already exists.
 * @param {{ force?: boolean }} options - Seed options.
 */
async function seedDatabase(options = {}) {
  if (!options.force && await isDevSeedPresent()) {
    console.log("[dev-env] Dev seed data already exists; skipping seed.");
    return;
  }

  run("npm", ["--prefix", "backend", "run", "db:seed"]);
}

/**
 * Apply migrations and seed without deleting existing data.
 */
async function migrateDatabase() {
  await ensureDependencies();
  await generatePrismaClient();
  await waitForDatabase();
  await timed("Migrate database", () => {
    runMigrateDeploy();
  });
  await timed("Seed database", () => seedDatabase());
  printDone("Database migrations are applied and seed data is ready.");
}

/**
 * Reset the disposable worktree database and seed it.
 */
async function resetDatabase() {
  await ensureDependencies();
  await generatePrismaClient();
  await waitForDatabase();
  await timed("Reset database", () => {
    run("npm", ["--prefix", "backend", "run", "db:reset", "--", "--force"]);
  });
  await timed("Seed database", () => seedDatabase({ force: true }));
  printDone("Database was reset and seed data is ready.");
}

/**
 * Run full app setup for a worktree.
 */
async function setup(doneMessage = "Setup complete.") {
  await ensureDependencies();
  await generatePrismaClient();
  await waitForDatabase();
  await timed("Migrate database", () => {
    runMigrateDeploy();
  });
  await timed("Seed database", () => seedDatabase());
  printDone(doneMessage);
}

/**
 * Ensure the app is ready, then start dev servers with the seeded test user.
 */
async function dev() {
  await setup("Dev setup preflight complete.");
  console.log("\n[dev-env] Starting dev server with seeded test-user auto-login...");
  run("npm", ["run", "dev:test"]);
}

/**
 * Run the fast test action.
 */
async function test() {
  await ensureDependencies();
  await timed("Run tests", () => {
    run("npm", ["test"]);
  });
  printDone("Tests passed.");
}

/**
 * Run the local equivalent of PR CI checks.
 */
async function ci() {
  await ensureDependencies();
  await timed("Build backend", () => {
    run("npm", ["--prefix", "backend", "run", "build"]);
  });
  await timed("Build frontend", () => {
    run("npm", ["--prefix", "frontend", "run", "build"]);
  });
  await timed("Lint frontend", () => {
    run("npm", ["--prefix", "frontend", "run", "lint"]);
  });
  await timed("Run backend tests", () => {
    run("npm", ["--prefix", "backend", "test"]);
  });
  await timed("Run frontend tests", () => {
    run("npm", ["--prefix", "frontend", "test"]);
  });
  printDone("Full local CI passed.");
}

function printHelp() {
  console.log(
    [
      "Usage: node scripts/dev-env.mjs <command>",
      "",
      "Commands:",
      "  deps        Install backend/frontend dependencies when needed.",
      "  db:migrate  Apply migrations and seed without resetting data.",
      "  db:reset    Reset the disposable worktree DB, then seed it.",
      "  setup       Install deps, generate Prisma, migrate, and seed.",
      "  dev         Ensure setup is ready, then run dev:test.",
      "  test        Install deps when needed, then run fast tests.",
      "  ci          Run the local equivalent of PR CI checks.",
    ].join("\n")
  );
}

const command = process.argv[2];

try {
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  } else if (command === "deps") {
    await deps();
  } else if (command === "db:migrate") {
    await migrateDatabase();
  } else if (command === "db:reset") {
    await resetDatabase();
  } else if (command === "setup") {
    await setup();
  } else if (command === "dev") {
    await dev();
  } else if (command === "test") {
    await test();
  } else if (command === "ci") {
    await ci();
  } else {
    printHelp();
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
