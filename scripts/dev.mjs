import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const enableServiceWorkerInDev =
  process.env.VITE_ENABLE_SW_DEV === '1' || process.env.VITE_ENABLE_SW_DEV === 'true';
const frontendDevScript = enableServiceWorkerInDev ? 'dev:pwa' : 'dev';

const services = [
  { name: 'backend', cwd: path.join(repoRoot, 'backend'), args: ['run', 'dev'] },
  // Keep the root-level dev:pwa flag and frontend script aligned to avoid accidental SW cleanup mode.
  { name: 'frontend', cwd: path.join(repoRoot, 'frontend'), args: ['run', frontendDevScript] },
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
  const child = spawn(npmCmd, service.args, {
    cwd: service.cwd,
    stdio: 'inherit',
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
