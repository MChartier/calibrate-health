import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { byteHash, SHA } from './release-plan.mjs';
import { verifyIosArtifact } from './ios-release.mjs';

export const IPA_EXTRACTION = `import pathlib, shutil, stat, sys, zipfile
archive, destination = sys.argv[1:]
root = pathlib.Path(destination).resolve()
with zipfile.ZipFile(archive) as z:
    entries = z.infolist()
    if len(entries) > 100000 or sum(e.file_size for e in entries) > 2*1024**3:
        raise ValueError('IPA exceeds extraction limits')
    names = set()
    for e in entries:
        p = pathlib.PurePosixPath(e.filename)
        if e.filename in names or p.is_absolute() or '..' in p.parts or chr(92) in e.filename or ':' in e.filename:
            raise ValueError('Unsafe or duplicate IPA path')
        names.add(e.filename)
        mode = e.external_attr >> 16
        if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
            raise ValueError('Unsupported IPA entry type')
        target = root.joinpath(*p.parts)
        if not target.is_relative_to(root):
            raise ValueError('IPA path escaped extraction root')
        if e.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(e) as source, target.open('xb') as output:
                shutil.copyfileobj(source, output)
            target.chmod((mode & 0o777) or 0o600)
`;

/** Convert separately signature-checked IPA metadata into the exact immutable receipt contract. */
export function ipaObservation({ info, updates, provisioning, signedEntitlements, bundleHasEndpoint, artifactSha256, teamId }, expected) {
  assert(/^[A-Z0-9]{10}$/.test(teamId ?? ''), 'Expected external Apple team ID is required.');
  const entitlements = provisioning.Entitlements;
  for (const key of ['application-identifier', 'com.apple.developer.team-identifier', 'get-task-allow']) {
    assert.equal(signedEntitlements?.[key], entitlements?.[key], 'Signed app entitlements differ from provisioning.');
  }
  assert(provisioning.TeamIdentifier?.length === 1 && provisioning.TeamIdentifier[0] === teamId &&
    entitlements?.['com.apple.developer.team-identifier'] === teamId &&
    entitlements?.['application-identifier'] === `${teamId}.${expected.bundleIdentifier}`, 'IPA provisioning identity differs from the selected Apple team and app.');
  assert(info.DTPlatformName === 'iphoneos' && info.CFBundleSupportedPlatforms?.includes('iPhoneOS'), 'IPA is not an iOS device build.');
  assert(/^iphoneos\d+\.\d+(?:\.\d+)?$/.test(info.DTSDKName ?? '') && Number(info.DTSDKName.match(/\d+/)[0]) >= 26 &&
    /^\d{4,5}$/.test(info.DTXcode ?? '') && Number(info.DTXcode) >= 2600,
  'App Store delivery requires Xcode 26 or later and the iOS 26 SDK or later (effective April 28, 2026).');
  assert(bundleHasEndpoint, 'IPA application bundle does not contain its configured endpoint.');
  assert(new Date(provisioning.ExpirationDate).getTime() > Date.now(), 'IPA provisioning profile has expired.');
  const distribution = provisioning.ProvisionsAllDevices ? 'enterprise' : provisioning.ProvisionedDevices?.length ? 'internal' : 'store';
  return {
    platform: 'ios', simulator: false, signed: true, entitlements, artifactSha256, distribution,
    bundleIdentifier: info.CFBundleIdentifier, version: info.CFBundleShortVersionString, buildNumber: info.CFBundleVersion,
    runtime: updates.EXUpdatesRuntimeVersion, projectId: String(updates.EXUpdatesURL ?? '').replace('https://u.expo.dev/', ''),
    channel: updates.EXUpdatesRequestHeaders?.['expo-channel-name'], serverUrl: expected.serverUrl
  };
}

/** macOS only. Raw provider output, profiles, account IDs and download URLs are never printed. */
export async function inspectIosBuild(build, expected, { teamId, execute = execFileSync, fetchImpl = fetch, platform = process.platform } = {}) {
  assert(platform === 'darwin', 'IPA signature inspection requires a macOS runner.');
  assert(SHA.test(expected.source) && build.id === expected.buildId, 'IPA verification requires the exact build and source.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-ipa-'));
  const run = (command, args, options = {}) => {
    try { return execute(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options }); }
    catch { throw Error('IPA inspection failed; no receipt was admitted.'); }
  };
  try {
    const url = new URL(build.artifacts.buildUrl);
    assert(url.protocol === 'https:' && !url.username && !url.password, 'Invalid authenticated EAS artifact location.');
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(120_000) });
    assert(response.ok && response.body, 'IPA download failed.');
    const archive = path.join(directory, 'artifact.ipa'), fd = fs.openSync(archive, 'wx', 0o600);
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length; assert(size <= 1024 ** 3, 'IPA exceeds the download limit.'); fs.writeSync(fd, chunk);
      }
    } finally { fs.closeSync(fd); }
    assert(size > 0, 'IPA download was empty.');
    const extracted = path.join(directory, 'unpacked'); fs.mkdirSync(extracted);
    run('python3', ['-c', IPA_EXTRACTION, archive, extracted]);
    const payload = path.join(extracted, 'Payload');
    const apps = fs.readdirSync(payload).filter(name => name.endsWith('.app'));
    assert(apps.length === 1, 'IPA must contain exactly one application.');
    const app = path.join(payload, apps[0]);
    assert(/^[A-Z0-9]{10}$/.test(teamId ?? ''), 'Expected external Apple team ID is required.');
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '-R', `anchor apple generic and certificate leaf[subject.OU] = "${teamId}"`, app]);
    const plist = file => JSON.parse(run('python3', ['-c',
      'import json,plistlib,sys; print(json.dumps(plistlib.load(open(sys.argv[1],"rb")),default=lambda v:v.isoformat()+"Z" if hasattr(v,"isoformat") else None))', file]));
    const profileXml = run('/usr/bin/security', ['cms', '-D', '-i', path.join(app, 'embedded.mobileprovision')]);
    const profile = path.join(directory, 'profile.plist'); fs.writeFileSync(profile, profileXml, { mode: 0o600 });
    const entitlements = path.join(directory, 'entitlements.plist');
    fs.writeFileSync(entitlements, run('/usr/bin/codesign', ['--display', '--entitlements', ':-', app]), { mode: 0o600 });
    const bundleFiles = fs.readdirSync(app).filter(name => /\.(jsbundle|hbc)$/.test(name));
    const observation = ipaObservation({ info: plist(path.join(app, 'Info.plist')), updates: plist(path.join(app, 'Expo.plist')),
      provisioning: plist(profile), signedEntitlements: plist(entitlements), teamId, artifactSha256: byteHash(fs.readFileSync(archive)),
      bundleHasEndpoint: bundleFiles.some(name => fs.readFileSync(path.join(app, name)).includes(Buffer.from(expected.serverUrl))) }, expected);
    return verifyIosArtifact(observation, expected);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
