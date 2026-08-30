import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createNativeReleaseBuildProvenance,
  writeNativeReleaseBuildProvenance
} from './native-release-build.mjs';
import { NATIVE_RELEASE_ARTIFACT_CONTRACTS } from './native-release-evidence.mjs';
import {
  assertNativePlaySourceCheckout,
  createGooglePlayPublisher,
  createGoogleServiceAccountAssertion,
  createNativePlayReleasePlan,
  GOOGLE_PLAY_MAX_VERSION_CODE,
  inspectNativePlayArtifact,
  NATIVE_PLAY_TRACKS,
  promoteNativePlayClosed,
  promoteNativePlayProduction,
  resolveGooglePlayAccessToken,
  runNativePlayReleaseCli,
  uploadNativePlayInternal,
  verifyNativePlayArtifacts
} from './native-play-release.mjs';

const SOURCE_COMMIT = 'a'.repeat(40);
const SHARED_SIGNER = 'f'.repeat(64);

function jsonResponse(payload, status = 200) {
  return new Response(payload === null ? '' : JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createReleaseRoot(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-play-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const phoneVersionName = options.phoneVersionName ?? '1.2.3';
  const manifest = {
    schema_version: 1,
    android: {
      application_id: options.applicationId ?? 'app.calibratehealth.mobile',
      mobile: {
        version_name: phoneVersionName,
        version_code: options.phoneVersionCode ?? 9,
        native_release_tag: options.nativeReleaseTag ?? `native-v${phoneVersionName}`
      },
      wear: {
        version_name: options.watchVersionName ?? '1.2.3',
        version_code: options.watchVersionCode ?? 10
      }
    }
  };
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(root, 'shared', 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, manifest };
}

function addReleaseArtifacts(root) {
  for (const contract of NATIVE_RELEASE_ARTIFACT_CONTRACTS) {
    const file = path.join(root, contract.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `signed-${contract.id}`);
  }
  const provenance = createNativeReleaseBuildProvenance(root, SOURCE_COMMIT);
  writeNativeReleaseBuildProvenance(root, provenance);
  return provenance;
}

function createArtifactInspector(root, options = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'release.json'), 'utf8'));
  return (_file, contract) => {
    const client = contract.role === 'phone' ? manifest.android.mobile : manifest.android.wear;
    const inspected = {
      applicationId: manifest.android.application_id,
      versionName: client.version_name,
      versionCode: client.version_code,
      signerSha256: options.signerFor?.(contract) ?? SHARED_SIGNER
    };
    return options.mutate?.(inspected, contract) ?? inspected;
  };
}

test('Play plan binds one package to distinct phone and Wear tracks and code lanes', (t) => {
  const { root } = createReleaseRoot(t);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });

  assert.equal(plan.applicationId, 'app.calibratehealth.mobile');
  assert.equal(plan.versionName, '1.2.3');
  assert.equal(plan.candidates.phone.versionCode, 9);
  assert.equal(plan.candidates.watch.versionCode, 10);
  assert.equal(plan.candidates.phone.internalTrack, 'qa');
  assert.equal(plan.candidates.watch.internalTrack, 'wear:qa');
  assert.equal(plan.candidates.phone.closedTrack, 'closed');
  assert.equal(plan.candidates.watch.closedTrack, 'wear:closed');
  assert.equal(plan.candidates.phone.productionTrack, 'production');
  assert.equal(plan.candidates.watch.productionTrack, 'wear:production');
  assert.match(plan.candidates.phone.artifactPath, /phone|mobile/);
  assert.match(plan.candidates.watch.artifactPath, /wear/);
  assert.match(plan.candidates.phone.releaseName, /@aaaaaaaaaaaa$/);
  assert.match(plan.candidates.watch.releaseName, /@aaaaaaaaaaaa$/);
});

test('Play plan rejects colliding, crossed-lane, or unpaired native versions', (t) => {
  const collision = createReleaseRoot(t, { phoneVersionCode: 8, watchVersionCode: 8 });
  assert.throws(
    () => createNativePlayReleasePlan({ root: collision.root, sourceCommit: SOURCE_COMMIT }),
    /distinct version codes/
  );

  const crossed = createReleaseRoot(t, { phoneVersionCode: 10, watchVersionCode: 11 });
  assert.throws(
    () => createNativePlayReleasePlan({ root: crossed.root, sourceCommit: SOURCE_COMMIT }),
    /Phone version codes must be odd and Wear version codes must be even/
  );

  const unpaired = createReleaseRoot(t, { watchVersionName: '1.2.4' });
  assert.throws(
    () => createNativePlayReleasePlan({ root: unpaired.root, sourceCommit: SOURCE_COMMIT }),
    /one paired native version_name/
  );
});

test('Play plan enforces the paired native tag and Google Play version-code maximum', (t) => {
  assert.equal(GOOGLE_PLAY_MAX_VERSION_CODE, 2_100_000_000);

  const wrongTag = createReleaseRoot(t, { nativeReleaseTag: 'native-v1.2.2' });
  assert.throws(
    () => createNativePlayReleasePlan({ root: wrongTag.root, sourceCommit: SOURCE_COMMIT }),
    /native_release_tag must be native-v1\.2\.3/
  );

  const tooHigh = createReleaseRoot(t, { phoneVersionCode: GOOGLE_PLAY_MAX_VERSION_CODE + 1 });
  assert.throws(
    () => createNativePlayReleasePlan({ root: tooHigh.root, sourceCommit: SOURCE_COMMIT }),
    /phone version_code must not exceed Google Play's 2100000000 maximum/
  );
});

test('source checkout must resolve the exact requested commit', () => {
  const cleanCheckout = (_command, args) =>
    args[0] === 'status' ? '' : `${SOURCE_COMMIT}\n`;
  assert.equal(
    assertNativePlaySourceCheckout('C:/repo', SOURCE_COMMIT, cleanCheckout),
    SOURCE_COMMIT
  );
  assert.throws(
    () => assertNativePlaySourceCheckout(
      'C:/repo',
      SOURCE_COMMIT,
      (_command, args) => args[0] === 'status' ? '' : `${'b'.repeat(40)}\n`
    ),
    /does not match checked-out HEAD/
  );
  assert.throws(
    () => assertNativePlaySourceCheckout(
      'C:/repo',
      SOURCE_COMMIT,
      (_command, args) => args[0] === 'status' ? ' M shared/release.json' : `${SOURCE_COMMIT}\n`
    ),
    /tracked files to match/
  );
});

test('artifact inspection dispatches APKs through aapt and apksigner and AABs through bundletool and keytool', () => {
  const calls = [];
  const tooling = {
    aapt: 'aapt',
    apksignerJar: 'apksigner.jar',
    java: 'java',
    keytool: 'keytool',
    bundletoolJar: 'bundletool.jar'
  };
  const execute = (command, args) => {
    calls.push({ command, args });
    if (command === tooling.aapt) {
      return "package: name='app.calibratehealth.mobile' versionCode='9' versionName='1.2.3'\n";
    }
    if (command === tooling.keytool) return `SHA256: ${SHARED_SIGNER}\n`;
    if (args[1] === tooling.apksignerJar) {
      return `Verified using v2 scheme (APK Signature Scheme v2): true\n` +
        `Signer #1 certificate SHA-256 digest: ${SHARED_SIGNER}\n`;
    }
    if (args[1] === tooling.bundletoolJar) {
      return '<manifest package="app.calibratehealth.mobile" ' +
        'android:versionCode="9" android:versionName="1.2.3">\n';
    }
    assert.fail(`Unexpected inspection command: ${command} ${args.join(' ')}`);
  };
  const apk = NATIVE_RELEASE_ARTIFACT_CONTRACTS.find(({ id }) => id === 'phone-apk');
  const aab = NATIVE_RELEASE_ARTIFACT_CONTRACTS.find(({ id }) => id === 'phone-aab');

  assert.deepEqual(inspectNativePlayArtifact('candidate.apk', apk, { execute, tooling }), {
    applicationId: 'app.calibratehealth.mobile',
    versionCode: 9,
    versionName: '1.2.3',
    signerSha256: SHARED_SIGNER
  });
  assert.deepEqual(inspectNativePlayArtifact('candidate.aab', aab, { execute, tooling }), {
    applicationId: 'app.calibratehealth.mobile',
    versionName: '1.2.3',
    versionCode: 9,
    signerSha256: SHARED_SIGNER
  });
  assert.deepEqual(calls, [
    { command: 'aapt', args: ['dump', 'badging', 'candidate.apk'] },
    {
      command: 'java',
      args: ['-jar', 'apksigner.jar', 'verify', '--print-certs', 'candidate.apk']
    },
    {
      command: 'java',
      args: ['-jar', 'bundletool.jar', 'dump', 'manifest', '--bundle=candidate.aab']
    },
    {
      command: 'keytool',
      args: [
        '-J-Duser.language=en',
        '-J-Duser.country=US',
        '-printcert',
        '-jarfile',
        'candidate.aab'
      ]
    }
  ]);

  assert.throws(
    () => inspectNativePlayArtifact('candidate.aab', aab, {
      execute,
      tooling: { ...tooling, bundletoolJar: null }
    }),
    /BUNDLETOOL_JAR/
  );
});

test('artifact verification binds provenance, current bytes, and one shared signer', (t) => {
  const { root } = createReleaseRoot(t);
  addReleaseArtifacts(root);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const verification = verifyNativePlayArtifacts({
    root,
    plan,
    artifactInspector: createArtifactInspector(root)
  });

  assert.equal(verification.sourceCommit, SOURCE_COMMIT);
  assert.equal(verification.signerSha256, SHARED_SIGNER);
  assert.equal(verification.artifacts.length, 4);
  assert.ok(verification.artifacts.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256)));

  fs.appendFileSync(path.join(root, plan.candidates.phone.artifactPath), 'tampered');
  assert.throws(
    () => verifyNativePlayArtifacts({ root, plan, artifactInspector: createArtifactInspector(root) }),
    /phone-aab (?:sizeBytes|sha256) does not match the independently inspected artifact/
  );
});

test('artifact verification rejects independently inspected package and version drift', (t) => {
  const { root } = createReleaseRoot(t);
  addReleaseArtifacts(root);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });

  assert.throws(
    () => verifyNativePlayArtifacts({
      root,
      plan,
      artifactInspector: createArtifactInspector(root, {
        mutate: (inspected, artifact) => artifact.id === 'phone-apk'
          ? { ...inspected, applicationId: 'example.stale.package' }
          : inspected
      })
    }),
    /phone-apk application ID must be app\.calibratehealth\.mobile/
  );
  assert.throws(
    () => verifyNativePlayArtifacts({
      root,
      plan,
      artifactInspector: createArtifactInspector(root, {
        mutate: (inspected, artifact) => artifact.id === 'watch-aab'
          ? { ...inspected, versionCode: inspected.versionCode - 2 }
          : inspected
      })
    }),
    /watch-aab version does not match shared\/release\.json/
  );
});

test('artifact verification rejects different phone and Wear signing identities', (t) => {
  const { root } = createReleaseRoot(t);
  addReleaseArtifacts(root);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });

  assert.throws(
    () => verifyNativePlayArtifacts({
      root,
      plan,
      artifactInspector: createArtifactInspector(root, {
        signerFor: (artifact) => artifact.role === 'phone' ? 'a'.repeat(64) : 'b'.repeat(64)
      })
    }),
    /must share one signing certificate/
  );
});

test('service-account credentials create a signed scoped JWT and exchange it without dependencies', async (t) => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-play-oauth-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const serviceAccountFile = path.join(root, 'service-account.json');
  const credentials = {
    client_email: 'publisher@example.iam.gserviceaccount.com',
    private_key: privateKey,
    token_uri: 'https://oauth2.googleapis.com/token'
  };
  fs.writeFileSync(serviceAccountFile, JSON.stringify(credentials));

  let exchange;
  const token = await resolveGooglePlayAccessToken({
    environment: {},
    serviceAccountFile,
    now: () => 1_700_000_000_000,
    fetchImpl: async (url, init) => {
      exchange = { url, init };
      return jsonResponse({ access_token: 'scoped-access-token', expires_in: 3600 });
    }
  });

  assert.equal(token, 'scoped-access-token');
  assert.equal(exchange.url, 'https://oauth2.googleapis.com/token');
  const form = new URLSearchParams(exchange.init.body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const assertion = form.get('assertion');
  const [header, claims, signature] = assertion.split('.');
  assert.equal(
    crypto.verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, 'base64url')),
    true
  );
  const payload = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'));
  assert.equal(payload.scope, 'https://www.googleapis.com/auth/androidpublisher');
  assert.equal(payload.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(payload.exp - payload.iat, 3600);

  const direct = await resolveGooglePlayAccessToken({
    environment: { GOOGLE_PLAY_ACCESS_TOKEN: ' direct-token ' },
    fetchImpl: () => assert.fail('direct token must not perform an OAuth exchange')
  });
  assert.equal(direct, 'direct-token');

  const built = createGoogleServiceAccountAssertion(credentials, { now: () => 1_700_000_000_000 });
  assert.equal(built.assertion.split('.').length, 3);
});

test('publisher uses one edit, media upload, form-factor tracks, and safe commit behavior', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-play-api-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bundle = path.join(root, 'candidate.aab');
  fs.writeFileSync(bundle, 'bundle-bytes');
  const requests = [];
  const publisher = createGooglePlayPublisher({
    applicationId: 'app.calibratehealth.mobile',
    accessToken: 'secret-access-token',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('/edits')) return jsonResponse({ id: 'edit-123' });
      if (url.includes('/bundles') && init.method === 'GET') return jsonResponse({ bundles: [] });
      if (url.includes('/bundles')) return jsonResponse({ versionCode: 9 });
      if (init.method === 'GET') return jsonResponse({ track: 'wear:qa', releases: [] });
      if (init.method === 'PUT') return jsonResponse(JSON.parse(init.body));
      if (init.method === 'DELETE') return new Response('', { status: 204 });
      return jsonResponse({ id: 'edit-123', expiryTimeSeconds: '1' });
    }
  });

  const editId = await publisher.createEdit();
  await publisher.getTrack(editId, NATIVE_PLAY_TRACKS.internal.watch);
  await publisher.listBundles(editId);
  await publisher.uploadBundle(editId, bundle);
  await publisher.updateTrack(editId, NATIVE_PLAY_TRACKS.internal.watch, {
    name: 'Wear candidate', versionCodes: ['10'], status: 'completed'
  });
  await publisher.commitEdit(editId);

  assert.equal(requests[0].url,
    'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/app.calibratehealth.mobile/edits');
  assert.match(requests[1].url, /tracks\/wear%3Aqa$/);
  assert.match(requests[2].url, /edits\/edit-123\/bundles$/);
  assert.equal(requests[2].init.method, 'GET');
  assert.match(requests[3].url,
    /^https:\/\/androidpublisher\.googleapis\.com\/upload\/androidpublisher\/v3\/.*\/bundles\?uploadType=media$/);
  assert.equal(requests[3].init.headers['Content-Type'], 'application/octet-stream');
  assert.deepEqual(JSON.parse(requests[4].init.body), {
    track: 'wear:qa',
    releases: [{ name: 'Wear candidate', versionCodes: ['10'], status: 'completed' }]
  });
  assert.match(requests[5].url, /edit-123:commit\?changesInReviewBehavior=ERROR_IF_IN_REVIEW$/);
  assert.ok(requests.every(({ init }) => init.headers.Authorization === 'Bearer secret-access-token'));
});

function fakePublisher(trackValues = {}, options = {}) {
  const calls = [];
  return {
    calls,
    async createEdit() { calls.push(['create']); return 'edit'; },
    async deleteEdit(editId) {
      calls.push(['delete', editId]);
      if (options.deleteError) throw new Error('transient delete failure');
    },
    async commitEdit(editId) { calls.push(['commit', editId]); },
    async getTrack(editId, track) {
      calls.push(['get', editId, track]);
      return trackValues[track] ?? { track, releases: [] };
    },
    async listBundles(editId) {
      calls.push(['list-bundles', editId]);
      return { bundles: options.bundles ?? [] };
    },
    async uploadBundle(editId, file) {
      calls.push(['upload', editId, file]);
      const localSha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      const reportedSha256 = typeof options.uploadSha256 === 'function'
        ? options.uploadSha256(file, localSha256)
        : options.uploadSha256 ?? localSha256;
      return { versionCode: file.includes('wear') ? 10 : 9, sha256: reportedSha256 };
    },
    async updateTrack(editId, track, release) {
      calls.push(['update', editId, track, release]);
      return { track, releases: [release] };
    }
  };
}

function existingBundleEntries(verification) {
  return verification.artifacts
    .filter(({ format }) => format === 'aab')
    .map(({ versionCode, sha256 }) => ({ versionCode, sha256 }));
}

test('internal upload commits paired bundles and tracks as one edit', async (t) => {
  const { root } = createReleaseRoot(t);
  addReleaseArtifacts(root);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const verification = verifyNativePlayArtifacts({ root, plan, artifactInspector: createArtifactInspector(root) });
  const publisher = fakePublisher();

  const result = await uploadNativePlayInternal({ root, plan, verification, publisher });

  assert.equal(result.alreadyComplete, false);
  assert.deepEqual(publisher.calls.map(([operation]) => operation), [
    'create', 'get', 'get', 'upload', 'upload', 'update', 'update', 'commit'
  ]);
  assert.deepEqual(
    publisher.calls.filter(([operation]) => operation === 'update').map(([, , track, release]) => ({ track, release })),
    [
      {
        track: 'qa',
        release: {
          name: plan.candidates.phone.releaseName,
          versionCodes: ['9'],
          status: 'completed'
        }
      },
      {
        track: 'wear:qa',
        release: {
          name: plan.candidates.watch.releaseName,
          versionCodes: ['10'],
          status: 'completed'
        }
      }
    ]
  );
});

test('internal upload rejects a Play bundle hash that differs from the verified AAB', async (t) => {
  const { root } = createReleaseRoot(t);
  addReleaseArtifacts(root);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const verification = verifyNativePlayArtifacts({ root, plan, artifactInspector: createArtifactInspector(root) });
  const publisher = fakePublisher({}, { uploadSha256: '0'.repeat(64) });

  await assert.rejects(
    () => uploadNativePlayInternal({ root, plan, verification, publisher }),
    /Google Play reported phone bundle SHA-256 0+; expected [0-9a-f]{64}/
  );
  assert.equal(publisher.calls.some(([operation]) => operation === 'update'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'commit'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'delete'), true);
});

test('internal retry requires version codes to belong to the same source commit', async (t) => {
  const { root } = createReleaseRoot(t);
  addReleaseArtifacts(root);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const verification = verifyNativePlayArtifacts({ root, plan, artifactInspector: createArtifactInspector(root) });
  const publisher = fakePublisher({
    qa: {
      track: 'qa',
      releases: [{ name: 'calibrate Android from another source', status: 'completed', versionCodes: ['9'] }]
    },
    'wear:qa': {
      track: 'wear:qa',
      releases: [{ name: plan.candidates.watch.releaseName, status: 'completed', versionCodes: ['10'] }]
    }
  }, { bundles: existingBundleEntries(verification) });

  await assert.rejects(
    () => uploadNativePlayInternal({ root, plan, verification, publisher }),
    /Phone internal track version code 9 belongs to a different source release/
  );
  assert.equal(publisher.calls.some(([operation]) => operation === 'upload'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'commit'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'delete'), true);
});

test('internal retry is complete only when both code and source marker match', async (t) => {
  const { root } = createReleaseRoot(t);
  addReleaseArtifacts(root);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const verification = verifyNativePlayArtifacts({ root, plan, artifactInspector: createArtifactInspector(root) });
  const publisher = fakePublisher({
    qa: {
      track: 'qa',
      releases: [{ name: plan.candidates.phone.releaseName, status: 'completed', versionCodes: ['9'] }]
    },
    'wear:qa': {
      track: 'wear:qa',
      releases: [{ name: plan.candidates.watch.releaseName, status: 'completed', versionCodes: ['10'] }]
    }
  }, { bundles: existingBundleEntries(verification) });

  const result = await uploadNativePlayInternal({ root, plan, verification, publisher });

  assert.equal(result.alreadyComplete, true);
  assert.equal(publisher.calls.some(([operation]) => operation === 'list-bundles'), true);
  assert.equal(publisher.calls.some(([operation]) => operation === 'upload'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'commit'), false);
  assert.equal(publisher.calls.at(-1)[0], 'delete');
});

test('internal retry rejects a stored Play bundle hash that differs from the verified AAB', async (t) => {
  const { root } = createReleaseRoot(t);
  addReleaseArtifacts(root);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const verification = verifyNativePlayArtifacts({ root, plan, artifactInspector: createArtifactInspector(root) });
  const bundles = existingBundleEntries(verification);
  bundles.find(({ versionCode }) => versionCode === 9).sha256 = '0'.repeat(64);
  const publisher = fakePublisher({
    qa: {
      track: 'qa',
      releases: [{ name: plan.candidates.phone.releaseName, status: 'completed', versionCodes: ['9'] }]
    },
    'wear:qa': {
      track: 'wear:qa',
      releases: [{ name: plan.candidates.watch.releaseName, status: 'completed', versionCodes: ['10'] }]
    }
  }, { bundles });

  await assert.rejects(
    () => uploadNativePlayInternal({ root, plan, verification, publisher }),
    /Google Play existing phone bundle SHA-256 0+; expected [0-9a-f]{64}/
  );
  assert.equal(publisher.calls.some(([operation]) => operation === 'upload'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'commit'), false);
  assert.equal(publisher.calls.at(-1)[0], 'delete');
});

test('internal no-op retry succeeds when empty-edit deletion fails transiently', async (t) => {
  const { root } = createReleaseRoot(t);
  addReleaseArtifacts(root);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const verification = verifyNativePlayArtifacts({ root, plan, artifactInspector: createArtifactInspector(root) });
  const publisher = fakePublisher({
    qa: {
      track: 'qa',
      releases: [{ name: plan.candidates.phone.releaseName, status: 'completed', versionCodes: ['9'] }]
    },
    'wear:qa': {
      track: 'wear:qa',
      releases: [{ name: plan.candidates.watch.releaseName, status: 'completed', versionCodes: ['10'] }]
    }
  }, {
    bundles: existingBundleEntries(verification),
    deleteError: true
  });

  const result = await uploadNativePlayInternal({ root, plan, verification, publisher });

  assert.equal(result.alreadyComplete, true);
  assert.equal(publisher.calls.some(([operation]) => operation === 'upload'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'commit'), false);
  assert.equal(publisher.calls.at(-1)[0], 'delete');
});

test('closed promotion moves the exact internal pair to custom closed form-factor tracks', async (t) => {
  const { root } = createReleaseRoot(t);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const publisher = fakePublisher({
    qa: {
      track: 'qa',
      releases: [{ name: plan.candidates.phone.releaseName, status: 'completed', versionCodes: ['9'] }]
    },
    'wear:qa': {
      track: 'wear:qa',
      releases: [{ name: plan.candidates.watch.releaseName, status: 'completed', versionCodes: ['10'] }]
    },
    closed: { track: 'closed', releases: [{ status: 'completed', versionCodes: ['7'] }] },
    'wear:closed': { track: 'wear:closed', releases: [{ status: 'completed', versionCodes: ['8'] }] }
  });

  const result = await promoteNativePlayClosed({ plan, publisher });

  assert.equal(result.alreadyComplete, false);
  assert.deepEqual(
    publisher.calls.filter(([operation]) => operation === 'update').map(([, , track]) => track),
    ['closed', 'wear:closed']
  );
  assert.equal(publisher.calls.some(([operation]) => operation === 'upload'), false);
  assert.equal(publisher.calls.at(-1)[0], 'commit');
});

test('promote-closed CLI routes the exact checkout through the closed stage', async (t) => {
  const { root } = createReleaseRoot(t);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const publisher = fakePublisher({
    qa: {
      track: 'qa',
      releases: [{ name: plan.candidates.phone.releaseName, status: 'completed', versionCodes: ['9'] }]
    },
    'wear:qa': {
      track: 'wear:qa',
      releases: [{ name: plan.candidates.watch.releaseName, status: 'completed', versionCodes: ['10'] }]
    },
    closed: { track: 'closed', releases: [] },
    'wear:closed': { track: 'wear:closed', releases: [] }
  });

  const result = await runNativePlayReleaseCli([
    'promote-closed',
    '--source-commit',
    SOURCE_COMMIT
  ], {
    root,
    execute: (_command, args) => args[0] === 'status' ? '' : `${SOURCE_COMMIT}\n`,
    environment: { GOOGLE_PLAY_ACCESS_TOKEN: 'test-access-token' },
    publisher
  });

  assert.deepEqual(result.tracks, NATIVE_PLAY_TRACKS.closed);
  assert.deepEqual(
    publisher.calls.filter(([operation]) => operation === 'update').map(([, , track]) => track),
    ['closed', 'wear:closed']
  );
});

test('closed promotion fails closed for an unknown destination release status', async (t) => {
  const { root } = createReleaseRoot(t);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const publisher = fakePublisher({
    qa: {
      track: 'qa',
      releases: [{ name: plan.candidates.phone.releaseName, status: 'completed', versionCodes: ['9'] }]
    },
    'wear:qa': {
      track: 'wear:qa',
      releases: [{ name: plan.candidates.watch.releaseName, status: 'completed', versionCodes: ['10'] }]
    },
    closed: { track: 'closed', releases: [{ status: 'futureStatus', versionCodes: ['7'] }] },
    'wear:closed': { track: 'wear:closed', releases: [] }
  });

  await assert.rejects(
    () => promoteNativePlayClosed({ plan, publisher }),
    /Phone closed track contains a release whose status is not completed/
  );
  assert.equal(publisher.calls.some(([operation]) => operation === 'update'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'commit'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'delete'), true);
});

test('production promotion verifies both closed releases and refuses a staged destination', async (t) => {
  const { root } = createReleaseRoot(t);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const publisher = fakePublisher({
    closed: {
      track: 'closed',
      releases: [{ name: plan.candidates.phone.releaseName, status: 'completed', versionCodes: ['9'] }]
    },
    'wear:closed': {
      track: 'wear:closed',
      releases: [{ name: plan.candidates.watch.releaseName, status: 'completed', versionCodes: ['10'] }]
    },
    production: { track: 'production', releases: [{ status: 'inProgress', versionCodes: ['7'] }] },
    'wear:production': { track: 'wear:production', releases: [] }
  });

  await assert.rejects(
    () => promoteNativePlayProduction({ plan, publisher }),
    /Phone production track contains a release whose status is not completed/
  );
  assert.equal(publisher.calls.some(([operation]) => operation === 'update'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'commit'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'delete'), true);
});

test('production promotion refuses closed codes published from another source commit', async (t) => {
  const { root } = createReleaseRoot(t);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const publisher = fakePublisher({
    closed: {
      track: 'closed',
      releases: [{ name: 'calibrate Android from another source', status: 'completed', versionCodes: ['9'] }]
    },
    'wear:closed': {
      track: 'wear:closed',
      releases: [{ name: plan.candidates.watch.releaseName, status: 'completed', versionCodes: ['10'] }]
    }
  });

  await assert.rejects(
    () => promoteNativePlayProduction({ plan, publisher }),
    /Phone closed track candidate version code 9 is not completed for source release.*@aaaaaaaaaaaa/
  );
  assert.equal(publisher.calls.some(([operation]) => operation === 'update'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'commit'), false);
  assert.equal(publisher.calls.some(([operation]) => operation === 'delete'), true);
});

test('production promotion moves the exact completed pair without uploading new bundles', async (t) => {
  const { root } = createReleaseRoot(t);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: SOURCE_COMMIT });
  const publisher = fakePublisher({
    closed: {
      track: 'closed',
      releases: [{ name: plan.candidates.phone.releaseName, status: 'completed', versionCodes: ['9'] }]
    },
    'wear:closed': {
      track: 'wear:closed',
      releases: [{ name: plan.candidates.watch.releaseName, status: 'completed', versionCodes: ['10'] }]
    },
    production: { track: 'production', releases: [{ status: 'completed', versionCodes: ['7'] }] },
    'wear:production': { track: 'wear:production', releases: [{ status: 'completed', versionCodes: ['8'] }] }
  });

  const result = await promoteNativePlayProduction({ plan, publisher });

  assert.equal(result.alreadyComplete, false);
  assert.deepEqual(
    publisher.calls.filter(([operation]) => operation === 'update').map(([, , track]) => track),
    ['production', 'wear:production']
  );
  assert.equal(publisher.calls.some(([operation]) => operation === 'upload'), false);
  assert.equal(publisher.calls.at(-1)[0], 'commit');
});
