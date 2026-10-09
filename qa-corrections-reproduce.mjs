import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ReleaseJournal, verifyRetirement} from './release-447/scripts/release-journal.mjs';
import {githubRetirement} from './release-447/scripts/release-retirement-github.mjs';
import {reconcileCandidates} from './release-447/scripts/release-retirement.mjs';
import {runReleaseOperation} from './release-447/scripts/release-operation.mjs';
import {byteHash} from './release-447/scripts/release-plan.mjs';
const out='release-447-published-evidence',root='release-447';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root});
const text=(...args)=>git(...args).toString().trim();
const head=text('rev-parse','HEAD'),parent='0c26cea12e3ecdbc962eebaeb140af35f54ab95a';
const live=JSON.parse(fs.readFileSync(`${out}/qa-corrections-live-scope.json`));
const input=JSON.parse(fs.readFileSync(`${out}/qa-corrections-input.json`));
assert.equal(hash(input.verdictComment.body),'9e6210f08edf66852e8c98be34add10dc57b810cbeb31fc6da13b84850f93717');
assert.equal(hash(input.pr.body),'f051f32990fde876035884150d8efaf827f9f98ba021f8aaa95d43bc65397fee');
assert.equal(text('status','--porcelain'),'');
const workflow=git('show',`${head}:.github/workflows/unified-release-handler.yml`).toString();
const names=[...workflow.matchAll(/^    name: (.+)$/gm)].map(m=>m[1].trim());
async function probe(providerEffect){
 const source='a'.repeat(40),repo='example/app',releases=[],data=new Map();let next=1,starts=0;
 const transport={releases:async()=>structuredClone(releases),release:async id=>structuredClone(releases.find(r=>r.id===id)),
 create:async r=>releases.push({...r,id:next++,author:{login:'github-actions[bot]'},assets:[]}),download:async id=>data.get(id),
 upload:async(id,name,content)=>{const a={id:next++,name,size:content.length,digest:`sha256:${byteHash(content)}`};releases.find(r=>r.id===id).assets.push(a);data.set(a.id,content);},
 rename:async(id,tag_name)=>{releases.find(r=>r.id===id).tag_name=tag_name;}};
 const run={id:42,run_attempt:1,status:'completed',conclusion:'cancelled',head_sha:source,head_branch:'master',event:'workflow_run',path:'.github/workflows/unified-release-handler.yml',repository:{full_name:repo}};
 const jobs=names.map((name,i)=>({id:i+1,run_id:42,run_attempt:1,name,status:'completed',conclusion:i?'cancelled':'success'}));
 const api=async route=>route.endsWith('/jobs')?structuredClone(jobs):route.includes('/git/ref/')?undefined:structuredClone(run);
 const candidates={pulls:async()=>undefined,master:async()=>source},adapter=githubRetirement({repository:repo,api,transport,candidates});
 const journal=new ReleaseJournal(transport,'42');await journal.create(source);
 if(providerEffect)await assert.rejects(runReleaseOperation(journal,'native-ios',{source},{find:async()=>[],start:async()=>{starts++;throw Error('lost response');}}),/lost response/);
 let rejection;try{await reconcileCandidates(transport,'43',adapter.inspect,adapter.closePull);}catch(e){rejection=e.message;}
 if(providerEffect){assert.match(rejection,/partial publication/);await assert.rejects(new ReleaseJournal(transport,'43').create(source),/unresolved/);}
 else{await verifyRetirement(transport,releases[0]);await new ReleaseJournal(transport,'43').create(source);}
 return {providerEffect,actualJobs:jobs.map(({name,conclusion})=>({name,conclusion})),retired:releases[0].tag_name,assets:releases[0].assets.map(a=>a.name),providerStarts:starts,nextAllocationAllowed:!providerEffect,rejection};
}
const ota=git('show',`${head}:.github/workflows/unified-ota-release.yml`).toString().replaceAll('\r\n','\n');
const stages=['environment','export','intent','publish'];
const approval=stages.map((name,index)=>{const block=ota.match(new RegExp(`\\n  ${name}:\\n[\\s\\S]*?(?=\\n  [a-z0-9_-]+:|$)`))[0];
 const environment=block.match(/^    environment: (.+)$/m)?.[1],needs=block.match(/^    needs: (.+)$/m)?.[1];
 if(index===0)assert.equal(environment,"${{ inputs.profile == 'production' && 'production' || 'preview' }}");else{assert.equal(needs,stages[index-1]);assert(!environment);assert(!/^    if:/m.test(block));}
 return {job:name,environment,needs,providerCredential: /EXPO_TOKEN:/.test(block)};});
const tree=text('merge-tree','--write-tree',live.target,head);assert.equal(text('diff','--binary',parent,head),text('diff','--binary',live.target,tree));
const scope={head,sourceParent:parent,actualTarget:live.target,ultimateTarget:live.master,mergeBase:text('merge-base',head,live.target),ultimateMergeBase:text('merge-base',head,live.master),...live,
 commits:live.commits.map(c=>({...c,paths:text('diff-tree','--no-commit-id','--name-status','-r',c.sha).split('\n')})),
 files:live.files.map(f=>({...f,sha256:hash(git('show',`${head}:${f.path}`))})),integration:{tree,conflictFree:true,committed:false,byteIdenticalChildPatch:true}};
assert.equal(scope.commits.length,4);assert.equal(scope.files.length,86);
const report={head,checkedAtUtc:new Date().toISOString(),qaVerdict:{commentId:input.verdictComment.id,bodySha256:hash(input.verdictComment.body),evidenceCommit:'b3ce696a170bd657e4e9f7715d7fc45f93b96c67'},
 R1:{disposition:'Corrected actual handler job inventory; every attempt requires both known terminal phases, consistent planning and no successful execute. Durable provider intents, partial results and unknown assets still reject retirement.',observations:[await probe(false),await probe(true)],regressions:'Real workflow names -> GitHub adapter -> retirement/journal; missing/unknown phases, successful earlier execute, lost provider response and failed/lost cleanup tested.'},
 R2:{disposition:'Moved existing environment protection to the first job, before EAS environment resolution. All later stages require predecessor success. No protection configuration changed.',observedStages:approval,regressions:'Approval expression and every dependency edge asserted on actual workflow, with implicit success scheduling and credential separation.'},
 validation:{focused:'71 pass',release:'278 pass, 2 existing skips',configuration:'consistent; acceptance policy valid',before:'Initial new R1/R2 regressions failed against production source 53de4b70; retained before log. Two additional cleanup regressions were added afterward.',lint:'Affected OTA workflow reports only existing queue:max unsupported-schema diagnostic. No new diagnostic; raw exit remains 1.'},
 applicability:'Original non-UI artifact selection/worker argument evidence remains applicable. Old retirement and approval-order coverage is superseded by these actual-path observations. Parent documentation impact remains applicable; no source rebase or parent merge.',externalOperations:0};
const write=(name,value)=>fs.writeFileSync(`${out}/${name}`,JSON.stringify(value,null,2)+'\n');
write('qa-corrections.json',report);write('qa-corrections-scope.json',scope);
fs.writeFileSync(`${out}/qa-corrections-original-body.txt`,input.pr.body);
for(const name of ['before.log','after.log','release.log','release-check.log','actionlint.json'])if(fs.existsSync(`release-447-qa-${name}`))fs.copyFileSync(`release-447-qa-${name}`,`${out}/qa-corrections-${name}`);
fs.copyFileSync(new URL(import.meta.url),`${out}/qa-corrections-reproduce.mjs`);
const files=fs.readdirSync(out).filter(n=>n.startsWith('qa-corrections')&&n!=='qa-corrections-manifest.json').sort();
write('qa-corrections-manifest.json',{head,purpose:'Retained nonmerged R1/R2 corrections and actual published scope; prior evidence preserved.',files:files.map(path=>({path,sha256:hash(fs.readFileSync(`${out}/${path}`))}))});
console.log(JSON.stringify({head,manifestSha256:hash(fs.readFileSync(`${out}/qa-corrections-manifest.json`)),reportSha256:hash(fs.readFileSync(`${out}/qa-corrections.json`))}));
