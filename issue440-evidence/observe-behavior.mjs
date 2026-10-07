import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const yaml=require('C:/Users/MChar/Code/calibrate-health/node_modules/yaml');
const root=path.resolve('release-entrypoints');
const base=path.resolve('inspect-master');
const sha=p=>execFileSync('git',['-C',p,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const result={checkedAtUtc:new Date().toISOString(),host:process.env.COMPUTERNAME,node:process.version,baseSha:sha(base),headSha:sha(root),method:'Actual source imports; synthetic requests and mocked native workers. No workflow dispatch, signing, build, upload, network, or deployment. Bash checks exercise only the request validation prefix before artifact construction.',before:{},after:{}};
function forms(p){return fs.readdirSync(path.join(p,'.github/workflows')).filter(f=>f.endsWith('-request.yml')).map(f=>({file:f,...yaml.parse(fs.readFileSync(path.join(p,'.github/workflows',f),'utf8'))})).filter(d=>['Cut release','Publish prepared release','Build Release Image','Release server'].includes(d.name)).map(d=>({file:d.file,name:d.name,inputs:d.on.workflow_dispatch.inputs}));}
result.before.forms=forms(base);result.after.forms=forms(root);assert.equal(result.before.forms.length,3);assert.equal(result.after.forms.length,1);
const before=await import(pathToFileURL(path.join(base,'scripts/native.mjs')));
const after=await import(pathToFileURL(path.join(root,'scripts/native.mjs')));
async function native(module,commands,failBuild=false){const calls=[],paths=[];let error;for(const args of commands){try{await module.runNative(args,{platform:'linux',environment:{PATH:'synthetic-tools',EXPO_TOKEN:'fixture-expo',GOOGLE_APPLICATION_CREDENTIALS:'fixture-play',CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD:'fixture-signing'},resolveCredentialFile:(field,override)=>{paths.push(field);return override??('synthetic-'+field+'.json');},log:()=>{},internal:async(args,{environment})=>{assert.equal(environment.EXPO_TOKEN,undefined);assert.equal(environment.GOOGLE_APPLICATION_CREDENTIALS,undefined);assert.equal(environment.CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD,undefined);calls.push(args);if(failBuild&&args[0]==='build')throw new Error('synthetic build verification failure');return {ok:true};}});}catch(e){error=e.message;break;}}return {commands,calls,credentialPathsResolved:paths,error};}
result.before.native=await native(before,[['build'],['submit']]);
result.after.native=await native(after,[['release']]);
result.after.retry=await native(after,[['release','--skip-build']]);
result.after.failedBuild=await native(after,[['release']],true);
assert.deepEqual(result.before.native.calls,result.after.native.calls);
assert.deepEqual(result.after.retry.credentialPathsResolved,['serviceAccountFile']);
assert.deepEqual(result.after.retry.calls.map(a=>a[0]),['submit']);assert.deepEqual(result.after.failedBuild.calls.map(a=>a[0]),['build']);
const {verifyReleaseRequest}=await import(pathToFileURL(path.join(root,'scripts/release-request.mjs')));
const context={operation:'server-release',repository:'MChartier/calibrate-health',repositoryId:'123456',runId:'987654',runAttempt:'2',headBranch:'master',headSha:'a'.repeat(40)};
const request=inputs=>({schema_version:1,operation:context.operation,repository:context.repository,repository_id:context.repositoryId,request_run_id:context.runId,request_run_attempt:context.runAttempt,head_branch:context.headBranch,head_sha:context.headSha,inputs});
result.after.routes=[];for(const operation of ['patch','minor','major','resume','image-only']){const inputs={operation,release_commit:['resume','image-only'].includes(operation)?'b'.repeat(40):'',release_tag:['resume','image-only'].includes(operation)?'v0.38.0':'',publish_latest:false};result.after.routes.push({inputs,output:verifyReleaseRequest(request(inputs),context)});}
result.after.rejections=[];for(const inputs of [{operation:'deploy',release_commit:'',release_tag:'',publish_latest:false},{operation:'patch',release_commit:'b'.repeat(40),release_tag:'v0.38.0',publish_latest:false},{operation:'resume',release_commit:'b'.repeat(40),release_tag:'v0.38.0',publish_latest:true}]){let rejection;try{verifyReleaseRequest(request(inputs),context);}catch(e){rejection=e.message;}assert.ok(rejection);result.after.rejections.push({inputs,rejection});}
const workflow=yaml.parse(fs.readFileSync(path.join(root,'.github/workflows/cut-release-request.yml'),'utf8'));
const prefix=workflow.jobs.request.steps.find(s=>s.name==='Create bound request artifact').run.split('          mkdir')[0].split('\nmkdir -p')[0];
assert.ok(!prefix.includes('jq -n'));assert.ok(!prefix.includes('mkdir -p'));
result.after.shellValidation=[];
for(const item of [...result.after.routes,...result.after.rejections]){const i=item.inputs;const run=spawnSync('C:/Program Files/Git/bin/bash.exe',['--noprofile','--norc','-c',prefix+'\nprintf "validated\\n"'],{encoding:'utf8',env:{PATH:'C:/Program Files/Git/usr/bin',SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,OPERATION:i.operation,RELEASE_COMMIT:i.release_commit,RELEASE_TAG:i.release_tag,PUBLISH_LATEST:String(i.publish_latest)}});if(run.error)throw run.error;assert.equal(run.status===0,!item.rejection);result.after.shellValidation.push({operation:i.operation,publish_latest:i.publish_latest,status:run.status,stdout:run.stdout.trim(),stderr:run.stderr.trim()});}
fs.mkdirSync('implementation-evidence',{recursive:true});fs.writeFileSync('implementation-evidence/behavior.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({base:result.baseSha,head:result.headSha,forms:[result.before.forms.length,result.after.forms.length],routes:result.after.routes.length,rejections:result.after.rejections.length,shellCases:result.after.shellValidation.length,nativeCalls:result.after.native.calls.map(a=>a[0]),retry:result.after.retry.calls.map(a=>a[0]),failure:result.after.failedBuild.calls.map(a=>a[0])}));
