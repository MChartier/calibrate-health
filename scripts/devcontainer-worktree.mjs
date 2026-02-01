#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Run a git command and return trimmed stdout.
 * @param {string[]} args - Arguments to pass to git.
 * @param {string} cwd - Working directory for the git command.
 * @returns {string} Trimmed stdout.
 */
function runGit(args, cwd) {
  return execFileSync("git", args, { encoding: "utf8", cwd }).trim();
}

/**
 * Parse `git worktree list --porcelain` into entries with path and branch.
 * @param {string} output - Raw porcelain output.
 * @returns {{ path: string, branch: string | null }[]} Parsed entries.
 */
function parseWorktreeEntries(output) {
  const entries = [];
  let current = null;

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) {
        entries.push(current);
      }
      current = { path: line.slice("worktree ".length).trim(), branch: null };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length).trim();
      current.branch = ref.startsWith("refs/heads/")
        ? ref.slice("refs/heads/".length)
        : ref;
    }
  }

  if (current) {
    entries.push(current);
  }

  return entries;
}

/**
 * Resolve the worktree path for a branch name.
 * @param {string} repoRoot - Repo root path to run git commands from.
 * @param {string} branchName - Branch name to match.
 * @returns {string} Matching worktree path.
 */
function resolveWorktreePath(repoRoot, branchName) {
  const worktreeList = runGit(["worktree", "list", "--porcelain"], repoRoot);
  const entries = parseWorktreeEntries(worktreeList);
  const match = entries.find((entry) => entry.branch === branchName);
  if (!match) {
    throw new Error(`No worktree found for branch "${branchName}".`);
  }
  return match.path;
}

/**
 * Determine whether a positional argument looks like a filesystem path.
 * @param {string} value - Raw positional value.
 * @returns {boolean} True when the value looks like a path.
 */
function isPathLike(value) {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("~") ||
    value.includes(path.sep)
  );
}

/**
 * Resolve the target workspace folder path based on CLI args.
 * @param {string[]} args - Positional/flag args (without subcommand).
 * @returns {{ workspacePath: string, devcontainerArgs: string[], commandArgs: string[], removeExistingContainer: boolean }} Resolved path + passthrough args.
 */
function resolveTarget(args) {
  const passthroughIndex = args.indexOf("--");
  const commandArgs =
    passthroughIndex === -1 ? [] : args.slice(passthroughIndex + 1);
  const inputArgs =
    passthroughIndex === -1 ? args.slice() : args.slice(0, passthroughIndex);

  let explicitPath = null;
  let branchName = null;
  let useCwd = false;
  let positional = null;
  const devcontainerArgs = [];
  let removeExistingContainer = false;

  for (let i = 0; i < inputArgs.length; i += 1) {
    const arg = inputArgs[i];

    if (arg === "--path") {
      explicitPath = inputArgs[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--branch") {
      branchName = inputArgs[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--cwd") {
      useCwd = true;
      continue;
    }

    if (arg === "--remove-existing-container") {
      removeExistingContainer = true;
      continue;
    }

    if (arg.startsWith("-")) {
      devcontainerArgs.push(arg);
      continue;
    }

    if (positional) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }

    positional = arg;
  }

  if (explicitPath && branchName) {
    throw new Error("Use either --path or --branch, not both.");
  }

  let targetPath = null;

  if (explicitPath) {
    targetPath = explicitPath;
  } else if (branchName) {
    const repoRoot = runGit(["rev-parse", "--show-toplevel"], process.cwd());
    targetPath = resolveWorktreePath(repoRoot, branchName);
  } else if (positional && !useCwd) {
    if (isPathLike(positional)) {
      targetPath = positional;
    } else {
      const repoRoot = runGit(["rev-parse", "--show-toplevel"], process.cwd());
      targetPath = resolveWorktreePath(repoRoot, positional);
    }
  } else {
    targetPath = process.cwd();
  }

  const resolved = fs.realpathSync(targetPath);
  const devcontainerPath = path.join(resolved, ".devcontainer");
  const devcontainerJson = path.join(devcontainerPath, "devcontainer.json");
  const legacyDevcontainerJson = path.join(resolved, ".devcontainer.json");
  if (!fs.existsSync(devcontainerJson) && !fs.existsSync(legacyDevcontainerJson)) {
    throw new Error(
      `No .devcontainer directory found at ${resolved}. Use --path to point at a worktree root.`
    );
  }

  return { workspacePath: resolved, devcontainerArgs, commandArgs, removeExistingContainer };
}

/**
 * Resolve the container workspace folder for a local workspace path.
 * @param {string} workspacePath - Local workspace root.
 * @returns {string} Container workspace path.
 */
function resolveContainerWorkspaceFolder(workspacePath) {
  const devcontainerPath = path.join(workspacePath, ".devcontainer");
  const devcontainerJsonPath = path.join(devcontainerPath, "devcontainer.json");
  const legacyDevcontainerJsonPath = path.join(
    workspacePath,
    ".devcontainer.json"
  );
  const configPath = fs.existsSync(devcontainerJsonPath)
    ? devcontainerJsonPath
    : legacyDevcontainerJsonPath;
  const defaultFolder = `/workspaces/${path.basename(workspacePath)}`;

  if (!configPath || !fs.existsSync(configPath)) {
    return defaultFolder;
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.workspaceFolder !== "string") {
      return defaultFolder;
    }

    return parsed.workspaceFolder
      .replace(
        /\$\{localWorkspaceFolderBasename\}/g,
        path.basename(workspacePath)
      )
      .replace(/\$\{localWorkspaceFolder\}/g, workspacePath);
  } catch (error) {
    return defaultFolder;
  }
}

/**
 * Build a command array that cd's into the workspace before exec.
 * @param {string} containerWorkspaceFolder - Workspace path inside the container.
 * @param {string[]} commandArgs - Command + args to exec.
 * @returns {string[]} Command array for devcontainer exec.
 */
function buildWorkspaceCommand(containerWorkspaceFolder, commandArgs) {
  const escapedPath = containerWorkspaceFolder.replace(/'/g, "'\\''");
  const command = `cd '${escapedPath}' && exec "$@"`;
  return ["bash", "-lc", command, "bash", ...commandArgs];
}

/**
 * Extract the containerId from devcontainer CLI stdout.
 * @param {string} stdout - Raw stdout from the CLI.
 * @returns {string|null} Container ID, if found.
 */
function extractContainerId(stdout) {
  if (!stdout) {
    return null;
  }

  let containerId = null;
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (!line.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed.containerId === "string") {
        containerId = parsed.containerId;
      }
    } catch (error) {
      // Ignore non-JSON lines.
    }
  }

  return containerId;
}

/**
 * Run `devcontainer up` and return the container id (if available).
 * @param {string[]} args - Arguments to pass to devcontainer.
 * @returns {string|null} Container id when reported by the CLI.
 */
function runDevcontainerUp(args) {
  const result = spawnSync("devcontainer", args, {
    stdio: ["inherit", "pipe", "inherit"],
    encoding: "utf8",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.status !== 0) {
    throw new Error("devcontainer up failed.");
  }

  return extractContainerId(result.stdout ?? "");
}

/**
 * Run a devcontainer CLI command and inherit stdio.
 * @param {string[]} args - Arguments to pass to devcontainer.
 */
function runDevcontainer(args) {
  execFileSync("devcontainer", args, { stdio: "inherit" });
}

/**
 * Print CLI usage information.
 */
function printHelp() {
  console.log(
    [
      "Usage:",
      "  npm run devcontainer:up -- <branch|path> [-- <devcontainer up args>]",
      "  npm run devcontainer:exec -- <branch|path> -- <command...>",
      "  npm run devcontainer:shell -- <branch|path> [-- <command...>]",
      "",
      "Options:",
      "  --path <path>    Use an explicit worktree path.",
      "  --branch <name>  Resolve a worktree by branch name.",
      "  --cwd            Use the current working directory.",
      "  --remove-existing-container  Recreate the container before exec.",
      "",
      "Notes:",
      "  - Run from any worktree in the repo when resolving by branch.",
      "  - For branch names that include '/', use --branch to disambiguate.",
      "  - When passing devcontainer args with values, prefer `--` or `--flag=value`.",
    ].join("\n")
  );
}

const argv = process.argv.slice(2);
const subcommand = argv.shift();

if (!subcommand || subcommand === "--help" || subcommand === "-h") {
  printHelp();
  process.exit(subcommand ? 0 : 1);
}

const allowed = new Set(["up", "exec", "shell"]);
if (!allowed.has(subcommand)) {
  console.error(`Unknown subcommand: ${subcommand}`);
  printHelp();
  process.exit(1);
}

let target;
try {
  target = resolveTarget(argv);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const containerWorkspaceFolder = resolveContainerWorkspaceFolder(
  target.workspacePath
);

if (subcommand === "up") {
  runDevcontainerUp([
    "up",
    "--workspace-folder",
    target.workspacePath,
    ...(target.removeExistingContainer ? ["--remove-existing-container"] : []),
    ...target.devcontainerArgs,
    ...target.commandArgs,
  ]);
  process.exit(0);
}

if (subcommand === "exec") {
  if (target.commandArgs.length === 0) {
    console.error("exec requires a command after '--'.");
    printHelp();
    process.exit(1);
  }

  const containerId = runDevcontainerUp([
    "up",
    "--workspace-folder",
    target.workspacePath,
    ...(target.removeExistingContainer ? ["--remove-existing-container"] : []),
  ]);
  const execArgs = [
    "exec",
    containerId ? "--container-id" : "--workspace-folder",
    containerId ? containerId : target.workspacePath,
    ...target.devcontainerArgs,
    "--",
    ...buildWorkspaceCommand(containerWorkspaceFolder, target.commandArgs),
  ];
  runDevcontainer(execArgs);
  process.exit(0);
}

const shellCommand =
  target.commandArgs.length === 0 ? ["bash"] : target.commandArgs;
const containerId = runDevcontainerUp([
  "up",
  "--workspace-folder",
  target.workspacePath,
  ...(target.removeExistingContainer ? ["--remove-existing-container"] : []),
]);
const execArgs = [
  "exec",
  containerId ? "--container-id" : "--workspace-folder",
  containerId ? containerId : target.workspacePath,
  ...target.devcontainerArgs,
  "--",
  ...buildWorkspaceCommand(containerWorkspaceFolder, shellCommand),
];
runDevcontainer(execArgs);
