#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const workspaceRoot = process.cwd();
const workspaceName = path.basename(workspaceRoot);
const repoDotenvPath = path.join(workspaceRoot, ".env");
const devcontainerDotenvPath = path.join(workspaceRoot, ".devcontainer", ".env");
const basePeacockColor = "#0077ff";
const worktreeColors = [
  "#ca2b2b",
  "#2bca2b",
  "#2b7aca",
  "#ca7a2b",
  "#7a2bca",
  "#2bcaa2",
  "#a2ca2b",
  "#ca2b7a",
];
const greekLetters = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "zeta",
  "eta",
  "theta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "omicron",
  "pi",
  "rho",
  "sigma",
  "tau",
  "upsilon",
  "phi",
  "chi",
  "psi",
  "omega",
];

/**
 * Return a lowercase Docker Compose project slug for the workspace.
 * @param {string} value - Workspace folder name.
 * @returns {string} Compose-safe slug.
 */
function slugify(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "cal-io";
}

/**
 * Compute a stable numeric hash for per-worktree ports and colors.
 * @param {string} value - Value to hash.
 * @returns {number} Unsigned integer from the hash prefix.
 */
function stableHash(value) {
  return Number.parseInt(crypto.createHash("sha256").update(value).digest("hex").slice(0, 8), 16);
}

/**
 * Run a git command in the workspace and return trimmed stdout.
 * @param {string[]} args - Git arguments.
 * @returns {string} Trimmed stdout.
 */
function runGit(args) {
  return execFileSync("git", args, { cwd: workspaceRoot, encoding: "utf8" }).trim();
}

/**
 * Resolve relative git paths against the workspace root.
 * @param {string} value - Path from git.
 * @returns {string} Absolute host path.
 */
function resolveGitPath(value) {
  if (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    return value;
  }
  return path.resolve(workspaceRoot, value);
}

/**
 * Resolve git metadata without shelling out, which helps sandboxed and Windows hosts.
 * @returns {string} Absolute common .git directory path, or an empty string.
 */
function resolveGitCommonDirFromMetadata() {
  const metadataPath = path.join(workspaceRoot, ".git");
  if (!fs.existsSync(metadataPath)) {
    return "";
  }

  if (fs.statSync(metadataPath).isDirectory()) {
    return metadataPath;
  }

  const match = fs.readFileSync(metadataPath, "utf8").match(/^gitdir:\s*(.+)\s*$/m);
  if (!match) {
    return "";
  }

  const gitDir = resolveGitPath(match[1].trim());
  const commonDirPath = path.join(gitDir, "commondir");
  if (fs.existsSync(commonDirPath)) {
    const commonDir = fs.readFileSync(commonDirPath, "utf8").trim();
    return resolveGitPath(path.isAbsolute(commonDir) ? commonDir : path.resolve(gitDir, commonDir));
  }

  const normalizedGitDir = gitDir.replace(/\\/g, "/");
  const worktreesMarker = "/.git/worktrees/";
  const markerIndex = normalizedGitDir.lastIndexOf(worktreesMarker);
  if (markerIndex !== -1) {
    return gitDir.slice(0, markerIndex + "/.git".length);
  }

  return gitDir;
}

/**
 * Format host paths for Docker Compose bind mounts on the current platform.
 * @param {string} value - Absolute host path.
 * @returns {string} Compose-friendly host path.
 */
function toComposePath(value) {
  return process.platform === "win32" ? value.replace(/\\/g, "/") : value;
}

/**
 * Read a single dotenv value without executing the file.
 * @param {string} dotenvPath - File path to read.
 * @param {string} key - Key to look up.
 * @returns {string} Parsed value, or an empty string.
 */
function readDotenvValueFromFile(dotenvPath, key) {
  if (!fs.existsSync(dotenvPath)) {
    return "";
  }

  const lines = fs.readFileSync(dotenvPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    let line = rawLine.trimStart();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("export ")) {
      line = line.slice("export ".length).trimStart();
    }
    if (!line.startsWith(`${key}=`)) {
      continue;
    }

    let value = line.slice(key.length + 1).trimStart();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }

  return "";
}

/**
 * Read a value from the repo-local dotenv file.
 * @param {string} key - Key to look up.
 * @returns {string} Parsed value, or an empty string.
 */
function readRepoDotenvValue(key) {
  return readDotenvValueFromFile(repoDotenvPath, key);
}

/**
 * Generate VAPID keys in the same URL-safe format used by web-push.
 * @returns {{ publicKey: string, privateKey: string }} Generated keys.
 */
function generateWebPushVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const publicJwk = publicKey.export({ format: "jwk" });
  const privateJwk = privateKey.export({ format: "jwk" });

  if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
    throw new Error("Failed to export VAPID JWK components.");
  }

  const fromBase64Url = (value) => {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + padding, "base64");
  };
  const toBase64Url = (value) =>
    value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const x = fromBase64Url(publicJwk.x);
  const y = fromBase64Url(publicJwk.y);
  const d = fromBase64Url(privateJwk.d);

  if (x.length !== 32 || y.length !== 32 || d.length !== 32) {
    throw new Error("Unexpected VAPID key length.");
  }

  return {
    publicKey: toBase64Url(Buffer.concat([Buffer.from([0x04]), x, y])),
    privateKey: toBase64Url(d),
  };
}

const gitMetadataPath = path.join(workspaceRoot, ".git");
const isMainWorktree =
  fs.existsSync(gitMetadataPath) && fs.statSync(gitMetadataPath).isDirectory();

let gitCommonDir = "";
let mainWorktreeName = workspaceName;
try {
  const rawGitCommonDir = runGit(["rev-parse", "--git-common-dir"]);
  if (rawGitCommonDir) {
    const resolvedGitCommonDir = resolveGitPath(rawGitCommonDir);
    if (fs.existsSync(resolvedGitCommonDir) && fs.statSync(resolvedGitCommonDir).isDirectory()) {
      gitCommonDir = fs.realpathSync(resolvedGitCommonDir);
      mainWorktreeName = path.basename(path.dirname(gitCommonDir));
    }
  }
} catch (error) {
  gitCommonDir = "";
}

if (!gitCommonDir) {
  const metadataGitCommonDir = resolveGitCommonDirFromMetadata();
  if (
    metadataGitCommonDir &&
    fs.existsSync(metadataGitCommonDir) &&
    fs.statSync(metadataGitCommonDir).isDirectory()
  ) {
    gitCommonDir = fs.realpathSync(metadataGitCommonDir);
    mainWorktreeName = path.basename(path.dirname(gitCommonDir));
  }
}

if (!gitCommonDir) {
  console.error("Unable to resolve the git common directory; worktree Git commands will fail in the container.");
  console.error("Run this script from a git worktree, or ensure git is available on the host.");
  process.exit(1);
}

const hash = stableHash(workspaceRoot);
let projectSlug = slugify(workspaceName);
if (!isMainWorktree) {
  projectSlug = `${projectSlug}-${hash}`;
}

// Offset keeps concurrent worktree dev servers from colliding on host ports.
const offset = hash % 1000;
const backendPort = 3000 + offset;
const frontendPort = 5173 + offset;
const greekLetterIndex = greekLetters.indexOf(workspaceName.toLowerCase().split("-").at(-1) ?? "");
const colorIndex =
  greekLetterIndex === -1 ? hash % worktreeColors.length : greekLetterIndex % worktreeColors.length;
const derivedColor = worktreeColors[colorIndex];
const worktreeColor = isMainWorktree ? basePeacockColor : derivedColor;
const viteWorktreeColor = isMainWorktree ? "" : derivedColor;

const repoCodexHome = readRepoDotenvValue("CODEX_HOME");
let codexHostHome = process.env.CODEX_HOME || repoCodexHome || path.join(os.homedir(), ".codex");
if (codexHostHome === "~") {
  codexHostHome = os.homedir();
} else if (codexHostHome.startsWith(`~${path.sep}`) || codexHostHome.startsWith("~/")) {
  codexHostHome = path.join(os.homedir(), codexHostHome.slice(2));
}
if (!path.isAbsolute(codexHostHome)) {
  codexHostHome = path.join(os.homedir(), codexHostHome);
}

const fatsecretClientId =
  process.env.FATSECRET_CLIENT_ID || readRepoDotenvValue("FATSECRET_CLIENT_ID");
const fatsecretClientSecret =
  process.env.FATSECRET_CLIENT_SECRET || readRepoDotenvValue("FATSECRET_CLIENT_SECRET");
const usdaApiKey = process.env.USDA_API_KEY || readRepoDotenvValue("USDA_API_KEY");

let webPushPublicKey =
  process.env.WEB_PUSH_PUBLIC_KEY ||
  readRepoDotenvValue("WEB_PUSH_PUBLIC_KEY") ||
  readDotenvValueFromFile(devcontainerDotenvPath, "WEB_PUSH_PUBLIC_KEY");
let webPushPrivateKey =
  process.env.WEB_PUSH_PRIVATE_KEY ||
  readRepoDotenvValue("WEB_PUSH_PRIVATE_KEY") ||
  readDotenvValueFromFile(devcontainerDotenvPath, "WEB_PUSH_PRIVATE_KEY");
let webPushSubject =
  process.env.WEB_PUSH_SUBJECT ||
  readRepoDotenvValue("WEB_PUSH_SUBJECT") ||
  readDotenvValueFromFile(devcontainerDotenvPath, "WEB_PUSH_SUBJECT");

if (!webPushPublicKey || !webPushPrivateKey) {
  try {
    const generated = generateWebPushVapidKeys();
    webPushPublicKey ||= generated.publicKey;
    webPushPrivateKey ||= generated.privateKey;
    console.error("Generated local WEB_PUSH VAPID keys for devcontainer startup.");
  } catch (error) {
    console.error("Unable to auto-generate WEB_PUSH VAPID keys; push notifications remain disabled.");
  }
}

if (!webPushSubject) {
  webPushSubject = "mailto:dev@calibrate.local";
}

const githubToken =
  process.env.CALIBRATE_GH_PAT ||
  process.env.GH_AUTH_TOKEN ||
  process.env.GH_TOKEN ||
  process.env.GITHUB_TOKEN ||
  readRepoDotenvValue("CALIBRATE_GH_PAT") ||
  readRepoDotenvValue("GH_AUTH_TOKEN") ||
  readRepoDotenvValue("GH_TOKEN") ||
  readRepoDotenvValue("GITHUB_TOKEN");

const lines = [
  `COMPOSE_PROJECT_NAME=${projectSlug}`,
  `WORKSPACE_FOLDER_NAME=${workspaceName}`,
  `MAIN_WORKTREE_NAME=${mainWorktreeName}`,
  `GIT_COMMON_DIR=${toComposePath(gitCommonDir)}`,
  `BACKEND_PORT=${backendPort}`,
  `FRONTEND_PORT=${frontendPort}`,
  `VITE_DEV_SERVER_PORT=${frontendPort}`,
  `WORKTREE_NAME=${workspaceName}`,
  `WORKTREE_IS_MAIN=${isMainWorktree ? "true" : "false"}`,
  `WORKTREE_COLOR=${worktreeColor}`,
  `VITE_WORKTREE_COLOR=${viteWorktreeColor}`,
  `VITE_WORKTREE_NAME=${workspaceName}`,
  `VITE_WORKTREE_IS_MAIN=${isMainWorktree ? "true" : "false"}`,
  "# Sourced from the host environment or repo-local .env during devcontainer init so Docker can pass it into the container.",
  `FATSECRET_CLIENT_ID=${fatsecretClientId}`,
  `FATSECRET_CLIENT_SECRET=${fatsecretClientSecret}`,
  `USDA_API_KEY=${usdaApiKey}`,
  `WEB_PUSH_PUBLIC_KEY=${webPushPublicKey}`,
  `WEB_PUSH_PRIVATE_KEY=${webPushPrivateKey}`,
  `WEB_PUSH_SUBJECT=${webPushSubject}`,
  `CODEX_HOST_HOME=${toComposePath(fs.realpathSync.native?.(codexHostHome) ?? fs.realpathSync(codexHostHome))}`,
  `GH_AUTH_TOKEN=${githubToken}`,
  `GITHUB_TOKEN=${githubToken}`,
  `GH_TOKEN=${githubToken}`,
  "",
].join("\n");

const tmpPath = `${devcontainerDotenvPath}.tmp`;
fs.writeFileSync(tmpPath, lines, "utf8");
if (fs.existsSync(devcontainerDotenvPath) && fs.readFileSync(devcontainerDotenvPath, "utf8") === lines) {
  fs.rmSync(tmpPath);
} else {
  fs.renameSync(tmpPath, devcontainerDotenvPath);
}
