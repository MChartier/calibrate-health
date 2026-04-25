#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Resolve the user-level cache root for host-side development tools.
 * @returns {string} Absolute cache directory.
 */
function resolveHostToolCacheRoot() {
  if (process.env.CALIBRATE_TOOL_CACHE) {
    return path.resolve(process.env.CALIBRATE_TOOL_CACHE);
  }

  const platformCacheRoot =
    process.platform === "win32"
      ? process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local")
      : process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(platformCacheRoot, "calibrate-health");
}

/**
 * Read the devcontainers CLI version pinned by the repo lockfile.
 * @param {string} repoRoot - Repository root to inspect.
 * @returns {string} Exact package version when available.
 */
export function readDevcontainerCliVersion(repoRoot = defaultRepoRoot) {
  const packageLockPath = path.join(repoRoot, "package-lock.json");
  if (fs.existsSync(packageLockPath)) {
    const packageLock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));
    const lockedVersion = packageLock.packages?.["node_modules/@devcontainers/cli"]?.version;
    if (lockedVersion) {
      return lockedVersion;
    }
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const requestedVersion = packageJson.devDependencies?.["@devcontainers/cli"];
  if (!requestedVersion) {
    throw new Error("Unable to resolve @devcontainers/cli version from package metadata.");
  }
  return requestedVersion;
}

/**
 * Resolve the shared host-side devcontainers CLI paths.
 * @param {string} repoRoot - Repository root to inspect.
 * @returns {{ cacheDir: string, cliJs: string, version: string }} Cache paths.
 */
export function resolveDevcontainerCliCache(repoRoot = defaultRepoRoot) {
  const version = readDevcontainerCliVersion(repoRoot);
  const cacheDir = path.join(resolveHostToolCacheRoot(), "devcontainer-cli", version);
  return {
    cacheDir,
    cliJs: path.join(cacheDir, "node_modules", "@devcontainers", "cli", "devcontainer.js"),
    version,
  };
}

/**
 * Run npm in a way that also works in Windows Codex-hosted Node processes.
 * Directly spawning npm.cmd can fail with EINVAL in that environment.
 * @param {string[]} args - npm arguments.
 * @param {string} cwd - Working directory for npm.
 * @returns {import("node:child_process").SpawnSyncReturns<Buffer>} Spawn result.
 */
function runNpm(args, cwd) {
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", "npm", ...args], {
      cwd,
      stdio: "inherit",
    });
  }

  return spawnSync("npm", args, {
    cwd,
    stdio: "inherit",
  });
}

/**
 * Install the devcontainers CLI into a user-level cache when it is missing.
 * @param {string} repoRoot - Repository root to inspect.
 * @returns {{ cacheDir: string, cliJs: string, version: string }} Cache paths.
 */
export function ensureDevcontainerCliCache(repoRoot = defaultRepoRoot) {
  const cache = resolveDevcontainerCliCache(repoRoot);
  if (fs.existsSync(cache.cliJs)) {
    return cache;
  }

  fs.mkdirSync(cache.cacheDir, { recursive: true });
  const result = runNpm(
    [
      "install",
      "--prefix",
      cache.cacheDir,
      `@devcontainers/cli@${cache.version}`,
      "--ignore-scripts",
      "--no-audit",
      "--fund=false",
    ],
    repoRoot
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Failed to install @devcontainers/cli@${cache.version} into ${cache.cacheDir}.`);
  }
  if (!fs.existsSync(cache.cliJs)) {
    throw new Error(`@devcontainers/cli install completed but ${cache.cliJs} was not found.`);
  }

  return cache;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const cache = ensureDevcontainerCliCache(process.cwd());
    console.log(cache.cliJs);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
