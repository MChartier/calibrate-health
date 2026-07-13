import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmExecPath = process.env.npm_execpath;
const autoLoginTestUser = process.argv.includes('--auto-login-test-user');

// Root development enables the PWA by default; set flags in-process so npm scripts stay cross-platform.
process.env.VITE_ENABLE_SW_DEV ??= '1';
if (autoLoginTestUser) process.env.AUTO_LOGIN_TEST_USER = 'true';

const services = [
  { name: 'backend', cwd: path.join(repoRoot, 'backend'), args: ['run', 'dev'] },
  // Vite reads VITE_ENABLE_SW_DEV from this process; using `dev` keeps Windows host startup shell-neutral.
  { name: 'frontend', cwd: path.join(repoRoot, 'frontend'), args: ['run', 'dev'] },
];

const states = new Map();
let shuttingDown = false;
let finalExitCode = 0;

function killAll(signal) {
  for (const { child } of states.values()) {
    if (!child.killed) child.kill(signal);
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
  // inherited from the parent npm script, with a shell fallback for direct `node scripts/dev.mjs` use.
  const command = npmExecPath ? process.execPath : npmCmd;
  const args = npmExecPath ? [npmExecPath, ...service.args] : service.args;
  const child = spawn(command, args, {
    cwd: service.cwd,
    stdio: 'inherit',
    shell: !npmExecPath && process.platform === 'win32',
  });

  states.set(service.name, { child, exited: false });

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

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0, signal));
}
