import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REQUIRED_CI,evaluateTrustedJobs,inspectTrustedCi} from '../calibrate-auth-qa/scripts/release-ci-gate.mjs';
const original=JSON.parse(readFileSync(new URL('./owner/original-release-run.json',import.meta.url)));
const build=JSON.parse(readFileSync(new URL('./owner/original-build-jobs.json',import.meta.url)));
const identity={repository:'MChartier/calibrate-health',base:original.head_sha,head:'a'.repeat(40),runId:String(original.id),runAttempt:'2',branch:'release/v1.2.3',number:'999'};
let ordinal=1;
const jobs=Object.entries(REQUIRED_CI).flatMap(([file,names])=>names.map(name=>({id:ordinal++,run_id:original.id,head_sha:identity.base,status:'completed',conclusion:'success',name:`Run protected cut release / Release candidate ${file.slice(0,-4)} / ${name} [${identity.head}]`})));
for(const j of build.jobs.filter(j=>j.conclusion==='skipped')) jobs.push({...j,id:ordinal++,run_id:original.id,head_sha:identity.base,name:`Run protected cut release / Release candidate builds / ${j.name}`});
jobs.push({id:ordinal++,run_id:original.id,head_sha:identity.base,status:'completed',conclusion:'skipped',name:'Run protected cut release / Release candidate database-upgrade / v0.14.0 Upgrade and Encrypted Rollback'});
const run={...original,status:'in_progress',conclusion:null,run_attempt:2,referenced_workflows:[...original.referenced_workflows,...Object.keys(REQUIRED_CI).map(file=>({path:`${identity.repository}/.github/workflows/${file}@${identity.base}`,sha:identity.base,ref:'refs/heads/master'}))]};
const pull={state:'open',merged:false,draft:false,head:{sha:identity.head,ref:identity.branch,repo:{full_name:identity.repository}},base:{sha:identity.base,ref:'master',repo:{full_name:identity.repository}}};
const api=async path=>path.includes('/jobs?')?jobs:path.endsWith('/runs/'+identity.runId)?run:path.includes('/pulls/')?pull:{object:{sha:identity.base}};
assert.equal((await inspectTrustedCi(api,identity)).selected.length,5);
let rejected=0;
for(const mutate of [j=>j.splice(0,1),j=>j.push({...j[0]}),j=>j[0].name=j[0].name.replace(identity.head,'c'.repeat(40)),j=>j[0].name=j[0].name.replace(` [${identity.head}]`,''),j=>j[0].run_id++,j=>j[0].head_sha='c'.repeat(40),j=>j[0].status='in_progress',j=>j.push({...j[0],id:999,conclusion:'failure'}),j=>j.push({...j[0],id:999,name:j[0].name.replace('Typecheck','Unexpected')})]) {const copy=structuredClone(jobs);mutate(copy);assert.throws(()=>evaluateTrustedJobs(copy,identity));rejected++;}
for(const conclusion of ['failure','cancelled','neutral','skipped',null]) {const copy=structuredClone(jobs);copy[0].conclusion=conclusion;assert.throws(()=>evaluateTrustedJobs(copy,identity));rejected++;}
for(const mutate of [r=>r.referenced_workflows.pop(),r=>r.referenced_workflows.push({...r.referenced_workflows.find(x=>x.path.includes('/lint.yml'))}),r=>r.run_attempt++,r=>r.head_sha=identity.head,r=>r.repository.full_name='other/repo']) {const copy=structuredClone(run);mutate(copy);await assert.rejects(inspectTrustedCi(async p=>p.endsWith('/runs/'+identity.runId)?copy:api(p),identity));rejected++;}
console.log(JSON.stringify({positive:'Model constructed from retained real run metadata and real skipped build job names; no live release execution',requiredSurfaces:5,namedSkips:jobs.length-Object.values(REQUIRED_CI).flat().length,negativeCasesRejected:rejected,source:identity.base}));
