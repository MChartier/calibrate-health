/** Protect the unified release graph: server health and native handoff gate OTA, store completion does not. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'yaml';

/** Parse workflow YAML as data so assertions cover actual job dependencies and permission scopes. */
function workflow(name) {
  return parse(fs.readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'));
}

test('the replacement graph retains the existing WireGuard deployment worker and named secrets', () => {
  const { jobs } = workflow('release-components');
  assert.equal(jobs.deploy.uses, './.github/workflows/deploy-self-hosted.yml');
  assert.deepEqual(Object.keys(jobs.deploy.secrets).sort(), ['DEPLOY_TOKEN', 'DEPLOY_WG_ENDPOINT', 'DEPLOY_WG_PRIVATE_KEY']);
  assert.match(jobs.deployment_intent.if, /outputs.server == 'true'/);
  assert.match(jobs.deployment_intent.if, /image_complete/);
  assert.equal(jobs.deploy.permissions.contents, 'read');
});

test('OTA depends on native handoff and selected deployment, never the submission monitor', () => {
  const { jobs } = workflow('release-components');
  assert.deepEqual(jobs.ota.needs, ['state', 'record_deploy', 'queue_phone']);
  assert.match(jobs.ota.if, /outputs.server != 'true'/);
  assert.match(jobs.ota.if, /outputs.native != 'true'/);
  assert.match(jobs.ota.if, /needs.queue_phone.result == 'success'/);
  assert.equal(jobs.finish_native.needs, 'queue_phone');
  assert.equal(jobs.finish_native.with.operation, 'finish');
  assert.ok(jobs.finish.needs.includes('ota'));
  assert.ok(jobs.finish.needs.includes('finish_native'));
});

test('native build and attestation retain separate credential and permission boundaries', () => {
  const { jobs } = workflow('native-build');
  assert.equal(jobs['build-internal'].environment, 'native-release-signing');
  assert.equal(jobs['build-internal'].permissions.contents, 'read');
  assert.equal(jobs.attest.environment, undefined);
  assert.equal(jobs.attest.permissions['id-token'], 'write');
  assert.equal(jobs.attest.permissions.contents, 'read');
  assert.ok(jobs.attest.steps.some((step) => step.uses?.startsWith('actions/attest@')));
});

test('submission installs tools and verifies retained binaries before admitting Expo authentication', () => {
  const steps = workflow('native-submit').jobs.submit.steps;
  const install = steps.findIndex((step) => step.run?.includes('npm ci'));
  const verify = steps.findIndex((step) => step.run?.includes('native-release-artifacts.mjs restore'));
  const submit = steps.findIndex((step) => step.env?.EXPO_TOKEN);
  assert.ok(install >= 0 && verify > install && submit > verify);
  assert.match(steps[install].run, /--ignore-scripts/);
});

test('OTA exports, attestations, and both credential stages remain separate on both channels', () => {
  const parsed = workflow('expo-ota-update');
  const { jobs } = parsed;
  assert.equal(parsed.on.workflow_call.inputs.native_build_ref, undefined);
  assert.equal(parsed.on.workflow_dispatch.inputs.native_build_ref, undefined);
  assert.equal(parsed.permissions.contents, 'read');
  const preflight = jobs['preflight-release-target'];
  assert.equal(preflight.permissions.contents, 'read');
  assert.doesNotMatch(JSON.stringify(preflight), /EXPO_TOKEN|secrets\./);
  assert.match(JSON.stringify(preflight), /merge-base --is-ancestor/);
  const approval = jobs['approve-production'];
  assert.equal(approval.environment, 'production');
  assert.equal(approval.permissions.contents, 'read');
  assert.ok(approval.needs.includes('publish-internal'));
  assert.match(approval.if, /!inputs.publish_internal \|\| needs.publish-internal.result == 'success'/);
  assert.match(approval.if, /needs.preflight-release-target.result == 'success'/);
  assert.equal(Object.values(jobs).filter(job => job.environment === 'production').length, 1);
  for (const channel of ['internal', 'production']) {
    const build = jobs[`build-${channel}-update`];
    assert.doesNotMatch(JSON.stringify(build), /EXPO_TOKEN|secrets\.|contents.*write/);
    assert.match(JSON.stringify(build), /expo-runtime\.mjs/);
    assert.match(JSON.stringify(build), /--runtime-file/);
    assert.match(JSON.stringify(build), /--platform android/);
    const retain = jobs[`retain-${channel}`];
    assert.equal(retain.permissions['id-token'], 'write');
    assert.doesNotMatch(JSON.stringify(retain), /EXPO_TOKEN|secrets\./);
    assert.ok(retain.steps.some(step => step.uses?.startsWith('actions/attest@')));
    const publish = jobs[`publish-${channel}`];
    assert.ok(publish.needs.includes(`retain-${channel}`));
    assert.match(JSON.stringify(publish), /expo-ota-store\.mjs restore/);
    assert.match(JSON.stringify(publish), /expo-ota-publish\.mjs/);
    for (const name of [`resolve-${channel}-environment`, `publish-${channel}`]) {
      const job = jobs[name];
      const auth = job.steps.findIndex(step => step.env?.EXPO_TOKEN);
      const install = job.steps.findIndex(step => step.run?.includes('npm ci'));
      assert.ok(install >= 0 && auth > install);
      assert.match(job.steps[auth - 1].run, /verify-current-release-workflow/);
      assert.equal(job.steps.filter(step => step.env?.EXPO_TOKEN).length, 1);
      assert.doesNotMatch(job.steps.map(step => step.run ?? '').join('\n'), /Install source dependencies|\.bin\/expo" export/);
      for (const step of job.steps.filter(step => step.uses?.startsWith('actions/checkout@'))) {
        assert.equal(step.with.ref, '${{ job.workflow_sha }}');
        assert.equal(step.with['persist-credentials'], false);
      }
    }
  }
});

test('paired builds admit signing after prebuild; promotions reuse verified artifacts and serialize Play writes', () => {
  const build = workflow('native-build').jobs;
  const signer = build['build-internal'];
  assert.doesNotMatch(JSON.stringify(signer), /EXPO_TOKEN|PLAY_|id-token/);
  const preparation = signer.steps.findIndex(step => step.run?.includes('native-release-build.mjs prepare'));
  const credentials = signer.steps.findIndex(step => JSON.stringify(step.env ?? {}).includes('secrets.CALIBRATE_ANDROID'));
  assert.ok(preparation >= 0 && credentials > preparation);
  assert.match(JSON.stringify(signer), /verify-artifacts/);
  assert.match(JSON.stringify(signer), /native-release-artifacts.mjs capture/);
  assert.doesNotMatch(JSON.stringify(build.attest), /secrets\.|EXPO_TOKEN|PLAY_/);
  const promotions = workflow('native-release');
  assert.doesNotMatch(JSON.stringify(promotions), /native-release-build|build-prepared|create-github-app-token|TAG_SIGNING|native-release-attestation|native-release-tags/);
  assert.match(JSON.stringify(promotions), /require-native-submitted/);
  assert.match(JSON.stringify(promotions), /native-eas-promote.mjs/);
  for (const name of ['cut-release-handler', 'publish-release-handler', 'native-release']) {
    assert.equal(workflow(name).concurrency.group, 'calibrate-server-release-publication');
    assert.equal(workflow(name).concurrency['cancel-in-progress'], false);
  }
});

test('no-op and client-only cuts avoid an empty version PR; recovery never calls the native builder', () => {
  const { jobs } = workflow('cut-release');
  assert.match(jobs.reserve.if, /noop/);
  assert.match(jobs.prepare.if, /outputs.server == 'true'/);
  assert.match(jobs.publish.if, /outputs.server != 'true' \|\| needs.finalize.result == 'success'/);
  assert.match(jobs.publish.with.release_commit, /inputs.source_sha/);
  const graph = workflow('release-components').jobs;
  assert.match(graph.native_build.if, /!inputs.recovery/);
  assert.match(graph.native_build.if, /native_build_complete != 'true'/);
  assert.match(graph.server_image.if, /image_complete != 'true'/);
  assert.equal(workflow('recover-release').jobs.resume.with.recovery, true);
  assert.doesNotMatch(JSON.stringify(workflow('publish-release')), /native-trust|\.release-trust|native_build_ref/);
  assert.equal(jobs.reserve.steps.find(step => step.uses?.startsWith('actions/download-artifact@')).with['artifact-ids'], '${{ needs.select.outputs.plan_artifact_id }}');
  const planDownload = jobs.reserve.steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  assert.equal(planDownload.with['merge-multiple'], true, 'ID-based downloads must flatten the single plan into the path consumed by begin');
  assert.match(jobs.reserve.steps.at(-1).run, /release-plan\/release-plan\.json/);
});
