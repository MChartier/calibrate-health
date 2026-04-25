#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDevcontainerCliCache } from "../scripts/devcontainer-cli-cache.mjs";

const workspacePath = path.resolve(process.env.CODEX_WORKTREE_PATH || process.cwd());
const sourceTreePath = process.env.CODEX_SOURCE_TREE_PATH
  ? path.resolve(process.env.CODEX_SOURCE_TREE_PATH)
  : "";
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";

/**
 * Run a setup command with inherited stdio so Codex shows actionable logs.
 * @param {string} command - Executable to run.
 * @param {string[]} args - Arguments for the executable.
 * @param {Record<string, string>} env - Extra environment variables.
 */
function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: workspacePath,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
  console.error(`Codex worktree path does not exist: ${workspacePath}`);
  process.exit(1);
}

// Codex worktrees only contain tracked files; copy ignored local secrets once.
if (sourceTreePath && sourceTreePath !== workspacePath) {
  const sourceEnv = path.join(sourceTreePath, ".env");
  const targetEnv = path.join(workspacePath, ".env");
  if (fs.existsSync(sourceEnv) && !fs.existsSync(targetEnv)) {
    fs.copyFileSync(sourceEnv, targetEnv);
  }
}

const devcontainerCli = ensureDevcontainerCliCache(workspacePath);

run(npmBin, ["run", "codex:devcontainer:start"], {
  DEVCONTAINER_CLI_JS: devcontainerCli.cliJs,
});
