import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createExpoCliEnvironment } from './expo-cli-environment.mjs';
import {
  createDevelopmentEnvironment,
  createDevelopmentServices,
  DEFAULT_EXPO_WEB_DEV_SERVER_PORT,
  isContainerizedLinux,
  resolveExpoNativeBackendUrl,
  resolveExpoWebDevServerPort,
  resolveTestUserAutoLogin,
  terminateDevelopmentChild
} from './dev.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

test('root development launches the backend and Expo web client', () => {
  const root = path.resolve('test-worktree');
  const services = createDevelopmentServices({ root, environment: {} });

  assert.deepEqual(services, [
    { name: 'backend', cwd: path.join(root, 'backend'), args: ['run', 'dev'] },
    {
      name: 'expo-web',
      cwd: path.join(root, 'mobile'),
      args: ['run', 'web', '--', '--port', DEFAULT_EXPO_WEB_DEV_SERVER_PORT]
    }
  ]);
});

test('Expo web uses an explicit port', () => {
  assert.equal(resolveExpoWebDevServerPort({ EXPO_WEB_DEV_SERVER_PORT: '6123' }), '6123');
  assert.equal(resolveExpoWebDevServerPort({}), DEFAULT_EXPO_WEB_DEV_SERVER_PORT);
  assert.throws(
    () => resolveExpoWebDevServerPort({ EXPO_WEB_DEV_SERVER_PORT: 'not-a-port' }),
    /whole-number TCP port/
  );
});

test('the Expo-only launcher keeps the worktree port without starting another backend', () => {
  assert.deepEqual(createDevelopmentServices({
    root: repositoryRoot,
    environment: { EXPO_WEB_DEV_SERVER_PORT: '6123' },
    expoWebOnly: true
  }), [{
    name: 'expo-web',
    cwd: path.join(repositoryRoot, 'mobile'),
    args: ['run', 'web', '--', '--port', '6123']
  }]);
});

test('the native Expo launcher starts the dev-client server without starting another backend', () => {
  assert.deepEqual(createDevelopmentServices({
    root: repositoryRoot,
    environment: {},
    expoOnly: true
  }), [{
    name: 'expo',
    cwd: path.join(repositoryRoot, 'mobile'),
    args: ['run', 'dev']
  }]);
});

test('native Expo targets the current worktree backend from the Android emulator', () => {
  assert.equal(resolveExpoNativeBackendUrl({
    root: repositoryRoot,
    environment: {},
    readFile: () => 'BACKEND_PORT=6123\nFRONTEND_PORT=8123\n'
  }), 'http://10.0.2.2:6123');
  assert.equal(resolveExpoNativeBackendUrl({
    root: repositoryRoot,
    environment: { EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'http://192.168.0.10:3000' },
    readFile: assert.fail
  }), 'http://192.168.0.10:3000');
  assert.throws(
    () => resolveExpoNativeBackendUrl({
      root: repositoryRoot,
      environment: {},
      readFile: () => 'BACKEND_PORT=not-a-port\n'
    }),
    /whole-number TCP port/
  );
});

test('test-user mode is inherited by both services without mutating the input environment', () => {
  const environment = { SESSION_SECRET: 'local-only' };
  const resolved = createDevelopmentEnvironment(environment, true, false);

  assert.deepEqual(resolved, {
    SESSION_SECRET: 'local-only',
    EXPO_PUBLIC_CALIBRATE_AUTO_LOGIN_TEST_USER: 'true',
    AUTO_LOGIN_TEST_USER: 'true'
  });
  assert.deepEqual(environment, { SESSION_SECRET: 'local-only' });
});

test('container Expo startup stays headless instead of treating Docker Desktop as host WSL', () => {
  assert.equal(isContainerizedLinux('linux', (filePath) => filePath === '/.dockerenv'), true);
  assert.equal(isContainerizedLinux('win32', () => true), false);
  assert.deepEqual(createDevelopmentEnvironment({}, true, true), {
    BROWSER: 'none',
    EXPO_UNSTABLE_HEADLESS: '1',
    EXPO_PUBLIC_CALIBRATE_AUTO_LOGIN_TEST_USER: 'true',
    AUTO_LOGIN_TEST_USER: 'true'
  });
  assert.equal(
    createDevelopmentEnvironment({ BROWSER: 'custom-browser' }, false, true).BROWSER,
    'custom-browser'
  );
});

test('local development auto-logs in the seeded user unless manual auth is requested', () => {
  assert.equal(resolveTestUserAutoLogin([]), true);
  assert.equal(resolveTestUserAutoLogin(['--auto-login-test-user']), true);
  assert.equal(resolveTestUserAutoLogin(['--manual-auth']), false);
  assert.equal(resolveTestUserAutoLogin(['--auto-login-test-user', '--manual-auth']), false);
  assert.equal(
    createDevelopmentEnvironment({}, resolveTestUserAutoLogin([]), false).AUTO_LOGIN_TEST_USER,
    'true'
  );
  assert.equal(
    createDevelopmentEnvironment({}, resolveTestUserAutoLogin(['--manual-auth']), false).AUTO_LOGIN_TEST_USER,
    undefined
  );
  assert.equal(
    createDevelopmentEnvironment({}, resolveTestUserAutoLogin(['--manual-auth']), false)
      .EXPO_PUBLIC_CALIBRATE_AUTO_LOGIN_TEST_USER,
    'false'
  );
});

test('Windows shutdown terminates the complete npm service process tree', () => {
  const child = { killed: false, pid: 4321, kill: assert.fail };
  const calls = [];

  terminateDevelopmentChild(child, 'SIGTERM', 'win32', (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0 };
  });

  assert.deepEqual(calls, [{
    command: 'taskkill',
    args: ['/PID', '4321', '/T', '/F'],
    options: { stdio: 'ignore', shell: false }
  }]);
});

test('non-Windows shutdown terminates the complete npm service process group', () => {
  const calls = [];
  terminateDevelopmentChild({
    killed: false,
    pid: 4321,
    kill: assert.fail
  }, 'SIGINT', 'linux', spawnSync, (pid, signal) => calls.push({ pid, signal }));
  assert.deepEqual(calls, [{ pid: -4321, signal: 'SIGINT' }]);
});

test('non-Windows shutdown falls back when process groups are unavailable', () => {
  const signals = [];
  terminateDevelopmentChild({
    killed: false,
    pid: 4321,
    kill: (signal) => signals.push(signal)
  }, 'SIGTERM', 'linux', spawnSync, () => { throw new Error('no process group'); });
  assert.deepEqual(signals, ['SIGTERM']);
});

test('Expo CLI can resolve app-local Router packages from its hoisted workspace location', () => {
  const environment = { NODE_PATH: path.join(repositoryRoot, 'existing-node-modules') };
  const resolved = createExpoCliEnvironment(repositoryRoot, environment);

  assert.equal(
    resolved.NODE_PATH,
    [path.join(repositoryRoot, 'mobile', 'node_modules'), environment.NODE_PATH].join(path.delimiter)
  );
  assert.deepEqual(environment, { NODE_PATH: path.join(repositoryRoot, 'existing-node-modules') });

  const resolution = spawnSync(
    process.execPath,
    ['-e', "require('expo-router/internal/routing')"],
    { cwd: repositoryRoot, env: createExpoCliEnvironment(repositoryRoot), encoding: 'utf8' }
  );
  assert.equal(resolution.status, 0, resolution.stderr || resolution.stdout);
});

test('Metro ignores dependency executable shims that devcontainers can make unreadable on Windows', () => {
  const metroConfig = require(path.join(repositoryRoot, 'mobile', 'metro.config.js'));
  const dependencyBinDirectory = path.join(repositoryRoot, 'mobile', 'node_modules', '.bin');

  assert.equal(
    metroConfig.resolver.blockList.some((pattern) => pattern.test(dependencyBinDirectory)),
    true
  );
});

test('package and devcontainer entry points target Expo web with browser-reachable ports', () => {
  const rootPackage = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const mobilePackage = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'mobile', 'package.json'), 'utf8'));
  const compose = fs.readFileSync(path.join(repositoryRoot, '.devcontainer', 'docker-compose.yml'), 'utf8');
  const prepareVolumes = fs.readFileSync(path.join(repositoryRoot, '.devcontainer', 'prepare-volumes.sh'), 'utf8');
  const initDevcontainer = fs.readFileSync(
    path.join(repositoryRoot, '.devcontainer', 'init-devcontainer-env.mjs'),
    'utf8'
  );
  const devEnvironmentScript = fs.readFileSync(
    path.join(repositoryRoot, 'scripts', 'dev-env.mjs'),
    'utf8'
  );

  assert.equal(rootPackage.scripts['dev:frontend'], 'npm run dev:expo-web');
  assert.equal(rootPackage.scripts['dev:expo'], 'node scripts/dev.mjs --expo-only');
  assert.equal(rootPackage.scripts['dev:expo-web'], 'node scripts/dev.mjs --expo-web-only');
  assert.equal(rootPackage.scripts.dev, 'node scripts/codex-worktree-env.mjs dev');
  assert.equal(rootPackage.scripts['dev:test'], 'node scripts/codex-worktree-env.mjs dev:test');
  assert.equal(rootPackage.scripts['dev:manual-auth'], 'node scripts/codex-worktree-env.mjs dev:manual-auth');
  assert.equal(rootPackage.scripts['dev:bootstrap'], 'node scripts/codex-worktree-env.mjs devcontainer:start');
  assert.equal(rootPackage.scripts['dev:setup'], 'node scripts/codex-worktree-env.mjs setup:expo');
  assert.equal(rootPackage.scripts['dev:build'], 'node scripts/codex-worktree-env.mjs build:expo-web');
  assert.equal(rootPackage.scripts['dev:reset'], 'node scripts/codex-worktree-env.mjs db:reset');
  assert.equal(rootPackage.scripts['dev:down'], 'node scripts/codex-worktree-env.mjs down');
  assert.equal(
    rootPackage.scripts['dev:reset-test-user-onboarding'],
    'node scripts/codex-worktree-env.mjs reset-test-user-onboarding'
  );
  assert.equal(rootPackage.scripts['dev:host'], 'node scripts/dev-env.mjs dev');
  assert.equal(rootPackage.scripts.build, 'npm run build:expo-web');
  assert.equal(rootPackage.scripts['test:web:e2e'], 'node scripts/expo-web-playwright.mjs');
  assert.equal(rootPackage.scripts['dev:vite'], undefined);
  assert.equal(mobilePackage.scripts.web, 'expo start --web');
  assert.equal(mobilePackage.scripts.dev, 'expo start --dev-client');
  assert.match(compose, /EXPO_WEB_DEV_SERVER_PORT: \$\{EXPO_WEB_PORT\}/);
  assert.match(compose, /EXPO_PUBLIC_CALIBRATE_SERVER_URL: http:\/\/localhost:\$\{BACKEND_PORT\}/);
  assert.match(compose, /BROWSER: none/);
  assert.match(compose, /workspace_node_modules:\/workspaces\/\$\{WORKSPACE_FOLDER_NAME\}\/node_modules/);
  assert.match(compose, /name: \$\{WORKSPACE_NODE_MODULES_VOLUME\}/);
  assert.match(prepareVolumes, /prepare_owned_volume "node_modules"/);
  assert.match(initDevcontainer, /`WORKSPACE_NODE_MODULES_VOLUME=\$\{workspaceNodeModulesVolume\}`/);
  assert.doesNotMatch(compose, /frontend_node_modules|VITE_/);
  assert.doesNotMatch(prepareVolumes, /frontend\/node_modules/);
  assert.doesNotMatch(initDevcontainer, /FRONTEND_|VITE_|frontendNodeModules/);
  assert.match(devEnvironmentScript, /runDevelopmentServers\(\{ argv:/);
  assert.doesNotMatch(devEnvironmentScript, /run\("node", \["scripts\/dev\.mjs"/);
});
