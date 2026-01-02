#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * Default AWS CLI profile used for Terraform runs when `AWS_PROFILE` is unset.
 * Keep this aligned with the profile developers commonly use for this repo.
 */
const DEFAULT_AWS_PROFILE = "calibratehealth";

/** Remote state locks can be held briefly; wait a bit before failing fast. */
const TF_LOCK_TIMEOUT = "5m";

/** @type {Record<string, {dir: string, backendExample: string, backendConfig: string}>} */
const STACKS = {
  bootstrap: {
    dir: "infra/bootstrap",
    backendExample: "infra/bootstrap/backend.hcl.example",
    backendConfig: "infra/bootstrap/backend.hcl"
  },
  staging: {
    dir: "infra/envs/staging",
    backendExample: "infra/envs/staging/backend.hcl.example",
    backendConfig: "infra/envs/staging/backend.hcl"
  },
  prod: {
    dir: "infra/envs/prod",
    backendExample: "infra/envs/prod/backend.hcl.example",
    backendConfig: "infra/envs/prod/backend.hcl"
  }
};

main();

/**
 * Entrypoint for running Terraform stacks with sane defaults:
 * - picks an AWS profile (defaulting to DEFAULT_AWS_PROFILE)
 * - ensures `backend.hcl` exists (copied from `backend.hcl.example` + bucket filled)
 * - re-runs `terraform init` before plan/apply
 */
function main() {
  const { stack, action, terraformArgs } = parseArgs(process.argv.slice(2));

  const repoRoot = getRepoRoot();
  const cfg = getStackConfig(stack);
  const awsProfile = resolveAwsProfile();
  const env = buildAwsEnv(awsProfile);

  const stackDir = path.join(repoRoot, cfg.dir);
  const backendExamplePath = path.join(repoRoot, cfg.backendExample);
  const backendConfigPath = path.join(repoRoot, cfg.backendConfig);

  ensureBackendConfig({
    backendExamplePath,
    backendConfigPath,
    awsProfile,
    env
  });

  terraformInit({ cwd: stackDir, env });
  terraformRunAction({ action, cwd: stackDir, env, terraformArgs });
}

/**
 * Parse CLI args in the form: <stack> <plan|apply> [terraform args...]
 * @param {string[]} argv
 * @returns {{stack: string, action: "plan"|"apply", terraformArgs: string[]}}
 */
function parseArgs(argv) {
  const [stack, action, ...terraformArgs] = argv;
  if (!stack || stack === "-h" || stack === "--help") {
    printUsageAndExit(0);
  }

  if (!action || action === "-h" || action === "--help") {
    printUsageAndExit(1);
  }

  if (!Object.prototype.hasOwnProperty.call(STACKS, stack)) {
    console.error(`Unknown stack: ${stack}`);
    printUsageAndExit(1);
  }

  if (action !== "plan" && action !== "apply") {
    console.error(`Unknown action: ${action}`);
    printUsageAndExit(1);
  }

  return { stack, action, terraformArgs };
}

/** @param {number} code */
function printUsageAndExit(code) {
  console.log(`Usage: node scripts/terraform.mjs <bootstrap|staging|prod> <plan|apply> [terraform args...]

Examples:
  npm run terraform:bootstrap:plan
  npm run terraform:staging:apply
  npm run terraform:prod:plan -- -refresh=false

AWS profile selection:
  - If AWS_PROFILE is set, it is used.
  - Otherwise defaults to AWS_PROFILE=${DEFAULT_AWS_PROFILE}.
`);
  process.exit(code);
}

/**
 * Resolve the repo root based on the location of this script (so it works from any cwd).
 * @returns {string}
 */
function getRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

/**
 * Get stack config, throwing if the stack name is unknown.
 * @param {string} stack
 * @returns {{dir: string, backendExample: string, backendConfig: string}}
 */
function getStackConfig(stack) {
  const cfg = STACKS[stack];
  if (!cfg) {
    throw new Error(`Unknown stack config: ${stack}`);
  }
  return cfg;
}

/**
 * Choose the AWS profile to use for Terraform/AWS CLI. Users can override by setting AWS_PROFILE.
 * @returns {string}
 */
function resolveAwsProfile() {
  return process.env.AWS_PROFILE || DEFAULT_AWS_PROFILE;
}

/**
 * Build an environment object that reliably applies the chosen AWS profile to child processes.
 * @param {string} awsProfile
 * @returns {NodeJS.ProcessEnv}
 */
function buildAwsEnv(awsProfile) {
  return {
    ...process.env,
    AWS_PROFILE: awsProfile,
    AWS_PAGER: "",
    AWS_SDK_LOAD_CONFIG: "1"
  };
}

/**
 * Ensure `backend.hcl` exists and is usable. If missing, copy from example and fill the S3 bucket.
 * @param {{backendExamplePath: string, backendConfigPath: string, awsProfile: string, env: NodeJS.ProcessEnv}} opts
 */
function ensureBackendConfig(opts) {
  const { backendExamplePath, backendConfigPath, awsProfile, env } = opts;

  if (!existsSync(backendExamplePath)) {
    throw new Error(`Missing backend template: ${backendExamplePath}`);
  }

  const desiredBucket = resolveTfstateBucket({ awsProfile, env });

  if (!existsSync(backendConfigPath)) {
    const example = readFileSync(backendExamplePath, "utf8");
    const rendered = renderBackendConfig(example, desiredBucket);
    writeFileSync(backendConfigPath, rendered, "utf8");
    return;
  }

  const current = readFileSync(backendConfigPath, "utf8");
  if (!current.includes("calibratehealth-tfstate-CHANGEME")) {
    return;
  }

  const updated = renderBackendConfig(current, desiredBucket);
  writeFileSync(backendConfigPath, updated, "utf8");
}

/**
 * Render a backend config file by filling in the derived S3 bucket name.
 * @param {string} template
 * @param {string} bucket
 * @returns {string}
 */
function renderBackendConfig(template, bucket) {
  const rendered = template.replace(
    /bucket\\s*=\\s*\"calibratehealth-tfstate-CHANGEME\"/g,
    `bucket         = \"${bucket}\"`
  );

  // Ensure a trailing newline for nicer diffs and tooling behavior.
  return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
}

/**
 * Resolve the S3 tfstate bucket name. Defaults to `calibratehealth-tfstate-<account_id>`.
 * @param {{awsProfile: string, env: NodeJS.ProcessEnv}} opts
 * @returns {string}
 */
function resolveTfstateBucket(opts) {
  const explicit = process.env.TFSTATE_BUCKET;
  if (explicit) {
    return explicit;
  }

  const accountId = getAwsAccountId(opts);
  return `calibratehealth-tfstate-${accountId}`;
}

/**
 * Retrieve the current AWS account id for the configured profile. If the profile uses SSO
 * and appears expired, attempt `aws sso login` once before failing.
 * @param {{awsProfile: string, env: NodeJS.ProcessEnv}} opts
 * @returns {string}
 */
function getAwsAccountId(opts) {
  const { awsProfile, env } = opts;

  const first = runAws([
    "sts",
    "get-caller-identity",
    "--query",
    "Account",
    "--output",
    "text",
    "--no-cli-pager",
    "--profile",
    awsProfile
  ], { env });

  if (first.ok) {
    return first.stdout.trim();
  }

  if (profileUsesSso({ awsProfile, env })) {
    const login = runAws(["sso", "login", "--profile", awsProfile], { env, inheritStdio: true });
    if (!login.ok) {
      throw new Error(login.stderr || "aws sso login failed");
    }

    const second = runAws([
      "sts",
      "get-caller-identity",
      "--query",
      "Account",
      "--output",
      "text",
      "--no-cli-pager",
      "--profile",
      awsProfile
    ], { env });

    if (second.ok) {
      return second.stdout.trim();
    }
  }

  throw new Error(
    [
      `Failed to resolve AWS account id for profile '${awsProfile}'.`,
      first.stderr || first.stdout || "(no AWS CLI output)"
    ].join("\n")
  );
}

/**
 * Detect whether an AWS CLI profile is configured for SSO.
 * @param {{awsProfile: string, env: NodeJS.ProcessEnv}} opts
 * @returns {boolean}
 */
function profileUsesSso(opts) {
  const { awsProfile, env } = opts;
  const res = runAws(["configure", "get", "sso_start_url", "--profile", awsProfile], { env });
  return res.ok && res.stdout.trim().length > 0;
}

/**
 * Run an AWS CLI command and capture output.
 * @param {string[]} args
 * @param {{env: NodeJS.ProcessEnv, inheritStdio?: boolean}} opts
 * @returns {{ok: boolean, stdout: string, stderr: string}}
 */
function runAws(args, opts) {
  const { env, inheritStdio } = opts;
  const res = spawnSync("aws", args, {
    env,
    stdio: inheritStdio ? "inherit" : ["ignore", "pipe", "pipe"],
    encoding: inheritStdio ? "utf8" : "utf8"
  });

  if (res.error && res.error.code === "ENOENT") {
    throw new Error("AWS CLI not found. Install awscli v2 and ensure `aws` is on PATH.");
  }

  return {
    ok: res.status === 0,
    stdout: res.stdout || "",
    stderr: res.stderr || ""
  };
}

/**
 * Run `terraform init` using the local `backend.hcl` file.
 * @param {{cwd: string, env: NodeJS.ProcessEnv}} opts
 */
function terraformInit(opts) {
  const { cwd, env } = opts;

  const res = spawnSync(
    "terraform",
    ["init", "-backend-config=backend.hcl", "-reconfigure"],
    { cwd, env, stdio: "inherit" }
  );

  if (res.error && res.error.code === "ENOENT") {
    throw new Error("Terraform not found. Install terraform and ensure `terraform` is on PATH.");
  }

  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

/**
 * Run `terraform plan` or `terraform apply` for a stack.
 * @param {{action: "plan"|"apply", cwd: string, env: NodeJS.ProcessEnv, terraformArgs: string[]}} opts
 */
function terraformRunAction(opts) {
  const { action, cwd, env, terraformArgs } = opts;

  const args = action === "plan"
    ? ["plan", `-lock-timeout=${TF_LOCK_TIMEOUT}`, ...terraformArgs]
    : ["apply", `-lock-timeout=${TF_LOCK_TIMEOUT}`, ...terraformArgs];

  const res = spawnSync("terraform", args, { cwd, env, stdio: "inherit" });
  process.exit(res.status ?? 1);
}

