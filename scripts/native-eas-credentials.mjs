import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INTERNAL_PROJECT_ID, requireExternalFile } from './native-internal-release.mjs';
import { NATIVE_RELEASE_APPLICATION_ID } from './native-release-evidence.mjs';
import { resolveLockedEasCliInvocation } from './native-ota-update.mjs';
import { createGoogleServiceAccountAssertion } from './native-play-release.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EAS_PLAY_CREDENTIAL_FILE = 'play-service-account.json';
const QUERY = `query LocalPlayCredentials($projectId: String!, $applicationIdentifier: String!) {
  app {
    byId(appId: $projectId) {
      id
      androidAppCredentials(filter: {applicationIdentifier: $applicationIdentifier, legacyOnly: false}) {
        applicationIdentifier
        googleServiceAccountKeyForSubmissions { keyJson }
      }
    }
  }
}`;

function authenticatedQuery(root) {
  const { entryPoint } = resolveLockedEasCliInvocation(root, []);
  // Keep the internal EAS API adapter with the pinned CLI that supplies its authentication.
  const require = createRequire(path.join(root, 'tools/eas-cli/package.json'));
  const build = path.resolve(path.dirname(entryPoint), '../build');
  const SessionManager = require(path.join(build, 'user/SessionManager.js')).default;
  const { createGraphqlClient } = require(path.join(build, 'commandUtils/context/contextUtils/createGraphqlClient.js'));
  const session = new SessionManager();
  const accessToken = session.getAccessToken();
  const sessionSecret = accessToken ? null : session.getSessionSecret();
  if (!accessToken && !sessionSecret) throw new Error('Sign in through native:configure before downloading Play credentials.');
  const client = createGraphqlClient({ accessToken, sessionSecret });
  return (query, variables) => client.query(query, variables, { noRetry: true }).toPromise();
}

export async function downloadEasPlayCredentials({ root, directory, query }) {
  const staging = fs.realpathSync(directory);
  if (!path.basename(staging).startsWith('eas-android-')) throw new Error('Invalid EAS credential staging directory.');
  requireExternalFile(root, path.join(staging, 'app.json'), 'EAS credential workspace');
  const request = query ?? authenticatedQuery(root);
  let response;
  try {
    response = await request(QUERY, { projectId: INTERNAL_PROJECT_ID, applicationIdentifier: NATIVE_RELEASE_APPLICATION_ID });
  } catch {
    throw new Error('EAS Play credential lookup failed. Check Expo access and retry native:configure.');
  }
  // Never include server errors or response bodies: they can contain credential data.
  if (response?.error) throw new Error('EAS Play credential lookup failed. Check Expo access and retry native:configure.');
  const app = response?.data?.app?.byId;
  const credentials = app?.androidAppCredentials;
  if (app?.id !== INTERNAL_PROJECT_ID || !Array.isArray(credentials) || credentials.length !== 1 ||
      credentials[0]?.applicationIdentifier !== NATIVE_RELEASE_APPLICATION_ID) {
    throw new Error('EAS did not return the exact linked project and Android application credentials.');
  }
  const assigned = credentials[0].googleServiceAccountKeyForSubmissions;
  if (assigned === null) return false;
  let account;
  try {
    account = JSON.parse(assigned.keyJson);
    createGoogleServiceAccountAssertion(account);
  } catch {
    throw new Error('The assigned EAS Play service-account key is invalid. Update it in EAS and retry native:configure.');
  }
  fs.writeFileSync(path.join(staging, EAS_PLAY_CREDENTIAL_FILE), JSON.stringify(account, null, 2) + '\n', {
    flag: 'wx', mode: 0o600
  });
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Expected one EAS credential staging directory.');
    const downloaded = await downloadEasPlayCredentials({ root: ROOT, directory: process.argv[2] });
    console.log(JSON.stringify({ downloaded }));
  } catch {
    console.error('[native] EAS Play credential download failed. Check the assigned key and Expo access, then retry native:configure.');
    process.exitCode = 1;
  }
}
