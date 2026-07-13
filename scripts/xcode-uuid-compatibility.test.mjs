import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

/** Prove the security override still satisfies the Expo config plugin that owns the xcode dependency. */
test('patched UUID remains compatible with xcode CommonJS project identifiers', () => {
  const configPluginPackage = require.resolve('@expo/config-plugins/package.json');
  const requireFromConfigPlugin = createRequire(configPluginPackage);
  const xcodeEntry = requireFromConfigPlugin.resolve('xcode');
  const requireFromXcode = createRequire(xcodeEntry);
  const xcode = requireFromXcode('xcode');
  const uuidPackage = requireFromXcode('uuid/package.json');
  const project = xcode.project('fixture.pbxproj');
  project.hash = { project: { objects: {} } };

  assert.equal(uuidPackage.version, '11.1.1');
  assert.match(project.generateUuid(), /^[0-9A-F]{24}$/);
});
