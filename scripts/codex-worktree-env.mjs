#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const workspacePath = path.resolve(process.env.CODEX_WORKTREE_PATH || repoRoot);
const devcontainerScript = path.join(
  workspacePath,
  "scripts",
  "devcontainer-worktree.mjs"
);

const commandMap = new Map([
  ["setup", { type: "up" }],
  ["shell", { type: "shell" }],
  ["test", { type: "exec", command: ["npm", "test"] }],
  ["test:coverage", { type: "exec", command: ["npm", "run", "test:coverage"] }],
  ["lint", { type: "exec", command: ["npm", "run", "lint"] }],
  ["build", { type: "exec", command: ["npm", "run", "build"] }],
  ["dev", { type: "exec", command: ["npm", "run", "dev"] }],
  ["dev:test", { type: "exec", command: ["npm", "run", "dev:test"] }],
  [
    "reset-test-user-onboarding",
    { type: "exec", command: ["npm", "run", "dev:reset-test-user-onboarding"] },
  ],
]);

/**
 * Run a command and preserve stdio so Codex/app actions show useful output.
 * @param {string} command - Command to run.
 * @param {string[]} args - Command arguments.
 * @param {string} cwd - Working directory for the command.
 */
function run(command, args, cwd = workspacePath) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}

/**
 * Print CLI usage information.
 */
function printHelp() {
  console.log(
    [
      "Usage:",
      "  npm run codex:setup",
      "  npm run codex:test",
      "  npm run codex:lint",
      "  npm run codex:build",
      "  npm run codex:dev",
      "  npm run codex:down",
      "",
      "The target worktree is CODEX_WORKTREE_PATH when Codex provides it; otherwise",
      "the current directory is used. Commands run through the worktree devcontainer.",
    ].join("\n")
  );
}

/**
 * Run docker compose down for the current worktree's generated devcontainer stack.
 */
function runComposeDown() {
  const initScript = path.join(workspacePath, ".devcontainer", "init-devcontainer-env.sh");
  const composeFile = path.join(workspacePath, ".devcontainer", "docker-compose.yml");
  const envFile = path.join(workspacePath, ".devcontainer", ".env");

  if (!fs.existsSync(initScript) || !fs.existsSync(composeFile)) {
    console.error(`No devcontainer config found at ${workspacePath}.`);
    process.exit(1);
  }

  run("bash", [initScript]);
  if (process.exitCode) {
    return;
  }

  run("docker", ["compose", "--env-file", envFile, "-f", composeFile, "down"]);
}

const commandName = process.argv[2];
if (
  !commandName ||
  commandName === "--help" ||
  commandName === "-h" ||
  process.argv.slice(3).some((arg) => arg === "--help" || arg === "-h")
) {
  printHelp();
  process.exit(commandName ? 0 : 1);
}

if (commandName === "down") {
  runComposeDown();
} else {
  const command = commandMap.get(commandName);
  if (!command) {
    console.error(`Unknown command: ${commandName}`);
    printHelp();
    process.exit(1);
  }

  if (!fs.existsSync(devcontainerScript)) {
    console.error(`No devcontainer helper found at ${devcontainerScript}.`);
    process.exit(1);
  }

  if (command.type === "up") {
    run(process.execPath, [devcontainerScript, "up", "--path", workspacePath]);
  } else if (command.type === "shell") {
    run(process.execPath, [devcontainerScript, "shell", "--path", workspacePath]);
  } else {
    run(process.execPath, [
      devcontainerScript,
      "exec",
      "--path",
      workspacePath,
      "--",
      ...command.command,
    ]);
  }
}
