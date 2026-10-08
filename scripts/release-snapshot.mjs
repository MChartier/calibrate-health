import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SHA } from './release-plan.mjs';
import { releaseInputs } from './release-inputs.mjs';

/** Dependency inspection never receives provider credentials or runs package lifecycle hooks. */
export function snapshotEnvironment(environment = process.env) {
  const allowed = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR']);
  return { ...Object.fromEntries(Object.entries(environment).filter(([name]) => allowed.has(name.toUpperCase()))),
    CI: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull,
    GIT_TERMINAL_PROMPT: '0', NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_FUND: 'false', NPM_CONFIG_IGNORE_SCRIPTS: 'true' };
}

/** Inspect each historical source with its own locked dependencies, never the current checkout's node_modules. */
export function sourceSnapshots({ root, execute = execFileSync, fingerprint = releaseInputs, environment = process.env }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-release-snapshots-'));
  const userConfig = path.join(directory, 'user.npmrc'), globalConfig = path.join(directory, 'global.npmrc');
  for (const file of [userConfig, globalConfig]) fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
  const env = { ...snapshotEnvironment(environment), NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig };
  const npmCli = environment.npm_execpath || [
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')
  ].find(file => fs.existsSync(file));
  const cache = new Map(), checkouts = new Map(); let closed = false;
  function run(command, args, cwd) {
    try { return execute(command, args, { cwd, env, encoding: 'utf8', windowsHide: true,
      maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { throw Error('Immutable source/dependency snapshot failed; no release baseline was admitted.'); }
  }
  return {
    snapshot: async (source, profile = 'production') => {
      assert(!closed && SHA.test(source), 'Snapshot requires an open cache and exact source commit.');
      assert(['internal', 'production'].includes(profile), 'Snapshot requires a supported profile.');
      const key = `${source}:${profile}`;
      if (cache.has(key)) return structuredClone(cache.get(key));
      const checkout = path.join(directory, source);
      if (!checkouts.has(source)) {
        run('git', ['clone', '--quiet', '--shared', '--no-checkout', '--', path.resolve(root), checkout], directory);
        run('git', ['-c', 'core.hooksPath=' + directory, 'checkout', '--quiet', '--detach', source], checkout);
        assert.equal(run('git', ['--no-replace-objects', 'rev-parse', 'HEAD'], checkout).trim(), source, 'Snapshot checkout differs.');
        assert(npmCli && fs.existsSync(npmCli), 'Cannot locate the installed Node runtime npm-cli.js.');
        run(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--include=dev', '--include=optional', '--no-audit', '--fund=false'], checkout);
        checkouts.set(source, checkout);
      }
      const result = fingerprint(checkout, source, { profile });
      cache.set(key, result); return structuredClone(result);
    },
    close: () => {
      if (closed) return;
      closed = true;
      // This exact fresh mkdtemp tree is owned only by this cache; no source checkout is removed.
      assert(path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('calibrate-release-snapshots-'));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}
