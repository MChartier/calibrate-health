#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const workspacePath = path.resolve(process.env.CODEX_WORKTREE_PATH || process.cwd());
const sourceTreePath = process.env.CODEX_SOURCE_TREE_PATH
  ? path.resolve(process.env.CODEX_SOURCE_TREE_PATH)
  : "";

const npmBin = "npm";

/**
 * Run a setup command with inherited stdio so Codex shows actionable logs.
 * @param {string} command - Executable to run.
 * @param {string[]} args - Arguments for the executable.
 */
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: workspacePath,
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

const devcontainerBin = path.join(
  workspacePath,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "devcontainer.cmd" : "devcontainer"
);

if (!fs.existsSync(devcontainerBin)) {
  const installArgs = fs.existsSync(path.join(workspacePath, "package-lock.json"))
    ? ["ci", "--ignore-scripts", "--no-audit", "--fund=false"]
    : ["install", "--ignore-scripts", "--no-audit", "--fund=false"];
  run(npmBin, installArgs);
}

run(npmBin, ["run", "codex:devcontainer:start"]);
