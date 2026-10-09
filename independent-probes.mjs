import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ReleaseJournal, verifyRetirement } from '../calibrate-auth-qa/scripts/release-journal.mjs';
import { githubRetirement } from '../calibrate-auth-qa/scripts/release-retirement-github.mjs';
import { reconcileCandidates } from '../calibrate-auth-qa/scripts/release-retirement.mjs';
import { byteHash } from '../calibrate-auth-qa/scripts/release-plan.mjs';
const source='a'.repeat(40), repo='example/app';
function fixture(names) {
  const releases=[], data=new Map(); let next=1;
  const transport={releases:async()=>structuredClone(releases),release:async id=>structuredClone(releases.find(r=>r.id===id)),
    create:async r=>releases.push({...r,id:next++,author:{login:'github-actions[bot]'},assets:[]}),download:async id=>data.get(id),
    upload:async(id,name,content)=>{const a={id:next++,name,size:content.length,digest:`sha256:${byteHash(content)}`};releases.find(r=>r.id===id).assets.push(a);data.set(a.id,content);},
    rename:async(id,tag_name)=>{releases.find(r=>r.id===id).tag_name=tag_name;}};
  const run={id:42,run_attempt:1,status:'completed',conclusion:'cancelled',head_sha:source,head_branch:'master',event:'workflow_run',path:'.github/workflows/unified-release-handler.yml',repository:{full_name:repo}};
  const jobs=names.map((name,i)=>({id:i+1,run_id:42,run_attempt:1,name,status:'completed',conclusion:i?'cancelled':'success'}));
  const api=async route=>route.endsWith('/jobs')?structuredClone(jobs):route.includes('/git/ref/')?undefined:structuredClone(run);
  const candidates={pulls:async()=>undefined,master:async()=>'b'.repeat(40)};
  const adapter=githubRetirement({repository:repo,api,transport,candidates});
  return {transport,adapter,releases,store:new ReleaseJournal(transport,'42')};
}
const yaml=fs.readFileSync(new URL('../calibrate-auth-qa/.github/workflows/unified-release-handler.yml',import.meta.url),'utf8');
const actualNames=[...yaml.matchAll(/^    name: (.+)$/gm)].map(x=>x[1].trim());
assert.deepEqual(actualNames,['Inspect immutable inputs and verified successful receipts','Run only the verified selected stages']);
const f=fixture(actualNames); await f.store.create(source);
// Cancellation immediately after journal creation: no plan, branch, PR, provider intent or effect.
await reconcileCandidates(f.transport,'43',f.adapter.inspect,f.adapter.closePull);
await verifyRetirement(f.transport,f.releases[0]);
assert.equal(f.releases[0].tag_name,'abandoned/unified/42');
await new ReleaseJournal(f.transport,'43').create('b'.repeat(40));
const control=fixture(['prepare']);await control.store.create(source);
await assert.rejects(reconcileCandidates(control.transport,'43',control.adapter.inspect,control.adapter.closePull),/job evidence/);
const blocked=fixture(actualNames);await blocked.store.create(source);
await blocked.store.put('op.native-ios.000001.json',{synthetic:'durable intent'});
await assert.rejects(reconcileCandidates(blocked.transport,'43',blocked.adapter.inspect,blocked.adapter.closePull),/partial publication/);
await assert.rejects(new ReleaseJournal(blocked.transport,'43').create('b'.repeat(40)),/unresolved/);
const ota=fs.readFileSync(new URL('../calibrate-auth-qa/.github/workflows/unified-ota-release.yml',import.meta.url),'utf8');
const jobs={};for(const m of ota.matchAll(/^  ([a-z]+):\r?\n([\s\S]*?)(?=^  [a-z]+:\r?\n|$(?![\s\S]))/gm))jobs[m[1]]=m[2];
assert(jobs.environment.includes('EXPO_TOKEN:') && jobs.environment.includes('release-ota-worker.mjs environment'));
assert(/^    environment:/m.test(jobs.environment));assert(!/^    environment:/m.test(jobs.export));assert(!/^    environment:/m.test(jobs.publish));
for (const [stage,previous] of [['export','environment'],['intent','export'],['publish','intent']]) {
 assert(jobs[stage].includes('needs: '+previous));assert(!/^    if:/m.test(jobs[stage]));
}
const result={sourceHead:'50f4a84558d9f0750ef2c6a39e82f1652e779024',retirement:{actualNames,retired:f.releases[0].tag_name,nextAllocationAllowed:true,obsoletePrepareRejected:true,providerIntentBlocks:true},productionApproval:{gateBeforeResolution:true,allDependentStagesRequireSuccess:true,sourceExportCredentialFree:!jobs.export.includes('EXPO_TOKEN:')},externalRequests:0};
fs.writeFileSync(new URL('independent-probes.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
