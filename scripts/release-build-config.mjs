import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildConfiguration, hash } from './release-plan.mjs';

/** The channel selects an update stream; an explicit build environment selects the backend. */
export function externalBuildConfiguration(root, profile, environment = process.env) {
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'mobile/eas.json'), 'utf8'));
  return buildConfiguration({ profile, environment: environment.EAS_ENVIRONMENT,
    channel: environment.EXPO_UPDATES_CHANNEL, projectId: environment.EXPO_PUBLIC_EAS_PROJECT_ID,
    serverUrl: environment.EXPO_PUBLIC_CALIBRATE_SERVER_URL }, eas);
}

export function verifyResolvedBuildEnvironment(configuration, resolved) {
  for (const [field, variable] of Object.entries({ serverUrl: 'EXPO_PUBLIC_CALIBRATE_SERVER_URL',
    projectId: 'EXPO_PUBLIC_EAS_PROJECT_ID', channel: 'EXPO_UPDATES_CHANNEL' })) {
    assert(resolved[variable] === configuration[field], `Resolved build environment differs for ${variable}.`);
  }
  // Return only a digest to the runner log; neither account/project settings nor environment contents are needed there.
  return { schema: 1, profile: configuration.profile, environment: configuration.environment,
    configurationDigest: hash(configuration) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert([4, 6].includes(process.argv.length) && process.argv[2] === '--profile' &&
      (process.argv.length === 4 || process.argv[4] === '--expected-digest'),
    'Usage: release-build-config.mjs --profile internal|production [--expected-digest SHA256]');
    const configuration = externalBuildConfiguration(process.cwd(), process.argv[3]);
    if (process.argv.length === 6) assert(/^[a-f0-9]{64}$/.test(process.argv[5]) && hash(configuration) === process.argv[5],
      'External build configuration changed from its immutable release plan.');
    console.log(JSON.stringify(verifyResolvedBuildEnvironment(configuration, process.env)));
  } catch (error) {
    // assert.equal includes values in its default inspector. Keep output restricted to the explicit diagnostic.
    console.error('Build configuration rejected: supply an explicit matching profile, environment, channel, project and HTTPS endpoint.'); process.exitCode = 1;
  }
}
