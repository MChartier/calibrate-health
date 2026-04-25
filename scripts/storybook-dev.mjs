#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DEFAULT_STORYBOOK_PORT = 6006; // Local default; devcontainers override with STORYBOOK_PORT.

/**
 * Parse a positive integer port from environment/config input.
 * @param {string | undefined} rawValue - Candidate port value.
 * @returns {number} Valid port, or the local Storybook default.
 */
function resolveStorybookPort(rawValue) {
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STORYBOOK_PORT;
}

/**
 * Detect whether the caller already passed a Storybook port flag.
 * @param {string[]} args - CLI args forwarded after `npm run dev:storybook --`.
 * @returns {boolean} True when args include a port override.
 */
function hasPortArg(args) {
  return args.some((arg) => arg === "-p" || arg === "--port" || arg.startsWith("--port="));
}

const forwardedArgs = process.argv.slice(2);
const portArgs = hasPortArg(forwardedArgs)
  ? []
  : ["--port", String(resolveStorybookPort(process.env.STORYBOOK_PORT))];
const npmArgs = ["--prefix", "frontend", "run", "storybook", "--", ...portArgs, ...forwardedArgs];

const result =
  process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npm", ...npmArgs], { stdio: "inherit" })
    : spawnSync("npm", npmArgs, { stdio: "inherit" });

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
