import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createExpoCliEnvironment } from './expo-cli-environment.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export const DEFAULT_EXPO_WEB_DEV_SERVER_PORT = '8081';

/** Devcontainers expose Docker's marker file even when their WSL2 kernel resembles host WSL. */
export function isContainerizedLinux(
  platform = process.platform,
  fileExists = fs.existsSync
) {
  return platform === 'linux' && fileExists('/.dockerenv');
}

/** Keep Expo reachable through worktree-specific devcontainer port mappings. */
export function resolveExpoWebDevServerPort(environment = process.env) {
  const rawPort = environment.EXPO_WEB_DEV_SERVER_PORT?.trim()
    || DEFAULT_EXPO_WEB_DEV_SERVER_PORT;
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('EXPO_WEB_DEV_SERVER_PORT must be a whole-number TCP port from 1 through 65535.');
  }
  return String(port);
}

export function createDevelopmentEnvironment(
  environment = process.env,
  autoLoginTestUser = false,
  containerized = isContainerizedLinux()
) {
  return {
    ...environment,
    ...(containerized
      ? {
          // Expo otherwise mistakes Docker Desktop's WSL2 kernel for host WSL and spawns cmd.exe.
          BROWSER: environment.BROWSER?.trim() || 'none',
          // The standalone native debugger needs desktop libraries that the web devcontainer omits.
          EXPO_UNSTABLE_HEADLESS: environment.EXPO_UNSTABLE_HEADLESS ?? '1'
        }
      : {}),
    EXPO_PUBLIC_CALIBRATE_AUTO_LOGIN_TEST_USER: autoLoginTestUser ? 'true' : 'false',
    ...(autoLoginTestUser ? { AUTO_LOGIN_TEST_USER: 'true' } : {})
  };
}

/** Local development uses the seeded account unless auth screens are being tested explicitly. */
export function resolveTestUserAutoLogin(argv = process.argv.slice(2)) {
  return !argv.includes('--manual-auth');
}

/** Stop npm wrappers and their descendants so a failed sibling cannot leave Metro orphaned. */
export function terminateDevelopmentChild(
  child,
  signal,
  platform = process.platform,
  spawnProcessSync = spawnSync,
  killProcess = process.kill
) {
  if (child.killed) return;
  if (platform === 'win32' && Number.isInteger(child.pid)) {
    const result = spawnProcessSync(
      'taskkill',
      ['/PID', String(child.pid), '/T', '/F'],
      { stdio: 'ignore', shell: false }
    );
    if (!result.error && result.status === 0) return;
  }
  if (platform !== 'win32' && Number.isInteger(child.pid)) {
    try {
      // Services run in detached process groups so npm, shells, and nodemon stop together.
      killProcess(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child when process groups are unavailable.
    }
  }
  child.kill(signal);
}

export function createDevelopmentServices({
  root = repoRoot,
  environment = process.env,
  expoWebOnly = false
} = {}) {
  const expoWebPort = resolveExpoWebDevServerPort(environment);
  const expoWebService = {
    name: 'expo-web',
    cwd: path.join(root, 'mobile'),
    args: ['run', 'web', '--', '--port', expoWebPort]
  };
  if (expoWebOnly) return [expoWebService];
  return [
    { name: 'backend', cwd: path.join(root, 'backend'), args: ['run', 'dev'] },
    expoWebService
  ];
}

export function runDevelopmentServers({
  argv = process.argv.slice(2),
  environment = process.env,
  root = repoRoot,
  spawnProcess = spawn
} = {}) {
  const autoLoginTestUser = resolveTestUserAutoLogin(argv);
  const expoWebOnly = argv.includes('--expo-web-only');
  const childEnvironment = createExpoCliEnvironment(
    root,
    createDevelopmentEnvironment(environment, autoLoginTestUser)
  );
  const services = createDevelopmentServices({ root, environment: childEnvironment, expoWebOnly });
  const npmExecPath = childEnvironment.npm_execpath;
  const states = new Map();
  let shuttingDown = false;
  let finalExitCode = 0;

  function killAll(signal) {
    for (const { child } of states.values()) {
      terminateDevelopmentChild(child, signal);
    }
  }

  function maybeExit() {
    const allExited = [...states.values()].every(({ exited }) => exited);
    if (allExited) process.exit(finalExitCode);
  }

  function shutdown(exitCode, signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    finalExitCode = exitCode;
    killAll(signal);
    setTimeout(() => process.exit(finalExitCode), 10_000).unref();
  }

  for (const service of services) {
    // npm.cmd cannot be spawned directly by current Windows Node releases. Prefer npm's JS CLI
    // inherited from the parent npm script, with a shell fallback for direct script execution.
    const command = npmExecPath ? process.execPath : npmCmd;
    const args = npmExecPath ? [npmExecPath, ...service.args] : service.args;
    const child = spawnProcess(command, args, {
      cwd: service.cwd,
      detached: process.platform !== 'win32',
      env: childEnvironment,
      stdio: 'inherit',
      shell: !npmExecPath && process.platform === 'win32'
    });

    states.set(service.name, { child, exited: false });

    child.on('error', (error) => {
      const state = states.get(service.name);
      if (state) state.exited = true;
      console.error(`[dev] Unable to start ${service.name}: ${error.message}`);
      shutdown(1, 'SIGTERM');
      maybeExit();
    });

    child.on('exit', (code, signal) => {
      const state = states.get(service.name);
      if (state) state.exited = true;

      if (!shuttingDown) {
        shutdown(code ?? 1, signal ?? 'SIGTERM');
      } else if (typeof code === 'number' && code !== 0) {
        finalExitCode = code;
      }

      maybeExit();
    });
  }

  const shutdownSignals = [
    'SIGINT',
    'SIGTERM',
    ...(process.platform === 'win32' ? [] : ['SIGHUP'])
  ];
  for (const signal of shutdownSignals) {
    process.on(signal, () => shutdown(0, signal));
  }
  process.once('exit', () => {
    if (!shuttingDown) killAll('SIGTERM');
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  runDevelopmentServers();
}
