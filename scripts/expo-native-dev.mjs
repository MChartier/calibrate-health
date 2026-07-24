#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createExpoCliEnvironment } from "./expo-cli-environment.mjs";
import { readDotenv, resolveDevConfig } from "./dev-config.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), "..");

/**
 * Resolve the Android emulator's URL for the backend exposed by this worktree.
 * @param {{
 *   repoRoot: string,
 *   backendPort: number,
 *   environment?: NodeJS.ProcessEnv,
 * }} options
 */
export function resolveExpoNativeBackendUrl({
  repoRoot,
  backendPort,
  environment = process.env,
}) {
  const repoEnvironment = readDotenv(path.join(repoRoot, ".env"));
  return (
    environment.EXPO_PUBLIC_CALIBRATE_SERVER_URL?.trim() ||
    repoEnvironment.EXPO_PUBLIC_CALIBRATE_SERVER_URL?.trim() ||
    `http://10.0.2.2:${backendPort}`
  );
}

/**
 * Resolve npm's JavaScript CLI so Windows does not need a shell wrapper.
 */
function resolveNpmCommand() {
  const inheritedNpmCli = process.env.npm_execpath;
  const installedNpmCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js"
  );
  const npmCli =
    inheritedNpmCli || (fs.existsSync(installedNpmCli) ? installedNpmCli : "");
  if (!npmCli) {
    throw new Error("Unable to locate npm. Run this command through `npm run dev:expo`.");
  }
  return { command: process.execPath, args: [npmCli] };
}

export async function main() {
  const repoRoot = path.resolve(process.env.CODEX_WORKTREE_PATH || defaultRepoRoot);
  const config = await resolveDevConfig({ workspacePath: repoRoot });
  const backendUrl = resolveExpoNativeBackendUrl({
    repoRoot,
    backendPort: config.backendPort,
  });
  const npm = resolveNpmCommand();

  console.log(`[expo-native] API: ${backendUrl}`);
  console.log("[expo-native] Start `npm run dev` separately if the Compose stack is not running.");

  const result = spawnSync(
    npm.command,
    [...npm.args, "--prefix", "mobile", "run", "dev"],
    {
      cwd: repoRoot,
      env: createExpoCliEnvironment(repoRoot, {
        ...process.env,
        EXPO_PUBLIC_CALIBRATE_SERVER_URL: backendUrl,
      }),
      stdio: "inherit",
      shell: false,
    }
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Expo exited with status ${result.status ?? 1}.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    await main();
  } catch (error) {
    console.error(`[expo-native] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
