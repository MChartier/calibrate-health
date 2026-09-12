import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReleaseContext, withReleaseLock } from './local-release-context.mjs';
import { prepareLocalNative, releaseLocalNative } from './local-release-native.mjs';
import { publishLocalOta } from './local-release-ota.mjs';

export function parseLocalReleaseArgs(argv) {
  if (!argv.length || argv.includes('--help')) return { help: true };
  const operation = argv[0];
  const allowed = {
    'native-prepare': ['--bump', '--dry-run'],
    native: ['--profile', '--build-only', '--dry-run'],
    ota: ['--channel', '--dry-run']
  };
  if (!allowed[operation]) throw new Error('Expected native-prepare, native, or ota.');
  const values = {};
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i];
    if (!allowed[operation].includes(key) || values[key] !== undefined) throw new Error('Unknown or duplicate option: ' + key);
    if (['--dry-run', '--build-only'].includes(key)) values[key] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(key + ' requires a value.');
      values[key] = argv[++i];
    }
  }
  const profile = values['--profile'] ?? 'internal';
  const channel = values['--channel'] ?? 'internal';
  if (![profile, channel].every(value => ['internal', 'production'].includes(value))) throw new Error('Choose internal or production.');
  const bump = values['--bump'];
  if (operation === 'native-prepare' && !['patch', 'minor', 'major'].includes(bump)) throw new Error('Choose --bump patch, minor, or major.');
  return { operation, profile, channel, bump, buildOnly: Boolean(values['--build-only']), dryRun: Boolean(values['--dry-run']) };
}

export async function executeLocalRelease(context, config, services = {}) {
  if (config.operation === 'native-prepare') return (services.prepare ?? prepareLocalNative)(context, config);
  if (config.operation === 'native') return (services.native ?? releaseLocalNative)(context, config);
  return (services.ota ?? publishLocalOta)(context, config);
}

export async function runLocalRelease(argv = process.argv.slice(2)) {
  const config = parseLocalReleaseArgs(argv);
  if (config.help) {
    console.log('Local client releases (current clean Git checkout):\n' +
      '  npm run release:native:prepare -- --bump patch [--dry-run]\n' +
      '  npm run release:native -- --profile internal|production [--build-only] [--dry-run]\n' +
      '  npm run release:ota -- --channel internal|production [--dry-run]\n\n' +
      'Internal builds produce device APKs; production also uploads phone/Wear to Play internal tracks.\n' +
      'Promote tested artifacts in Play Console. OTA publishes through Expo.\n' +
      'Deploy required server changes yourself before publishing clients. See docs/local-release.md.');
    return;
  }
  const context = createReleaseContext();
  console.log('Source: ' + context.sourceCommit + '\nClient requires server ' + context.client.requiresServer +
    '\nServer deployment and release ordering are the maintainer\'s responsibility.');
  const result = config.dryRun ? await executeLocalRelease(context, config) :
    await withReleaseLock(context, () => executeLocalRelease(context, config));
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runLocalRelease().catch(error => { console.error('[local-release] ' + error.message); process.exitCode = 1; });
}
