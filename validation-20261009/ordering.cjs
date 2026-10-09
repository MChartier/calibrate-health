const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../validation-453');
const backend = path.join(root, 'backend');
const req = createRequire(path.join(backend, 'package.json'));
const { Pool } = req('pg');
const url = 'postgresql://postgres@127.0.0.1:55453/calibrate_test_453_order';
const schema = 'ordering_' + randomUUID().replaceAll('-', '');
const admin = new Pool({ connectionString: url });
const deferred = () => { let resolve; const promise = new Promise(r => resolve=r); return {promise,resolve}; };
let database;
const observations=[];
async function main() {
  assert.equal(new URL(url).hostname,'127.0.0.1');
  await admin.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = url+'?schema='+schema;
  process.env.AUTH_PROVIDER='local';
  const migration=execFileSync(process.execPath,[req.resolve('prisma/build/index.js'),'migrate','deploy'],{cwd:backend,env:process.env,encoding:'utf8'});
  fs.writeFileSync(path.join(__dirname,'ordering-migrations.log'),migration);
  req('ts-node').register({project:path.join(backend,'tsconfig.json'),transpileOnly:true});
  database=req('./src/config/database');
  const db=database.default;
  const planning=req('./src/services/caloriePlanningLock');
  const { AccountDeletionCoordinator }=req('./src/services/accountDeletion');
  const metrics=req('./src/routes/metrics').default;
  const imports=req('./src/routes/imports').default;
  const watch=req('./src/services/watch');
  const AdmZip=req('adm-zip');
  const today=new Date().toISOString().slice(0,10);
  const originalLock=planning.lockCaloriePlanningInputs;
  const originalTransaction=db.$transaction.bind(db);
  const handler=(router,p)=>router.stack.find(l=>l.route?.path===p && l.route.methods.post).route.stack.at(-1).handle;
  async function fixture(mapped=true) {
    const user=await db.user.create({data:{email:randomUUID()+'@example.invalid',password_hash:'synthetic-only',timezone:'UTC',date_of_birth:new Date('1990-01-01Z'),sex:'MALE',height_mm:1800,activity_level:'MODERATE',weight_unit:'KG',height_unit:'CM'}});
    const goal=await db.goal.create({data:{user_id:user.id,start_weight_grams:90000,target_weight_grams:75000,daily_deficit:500}});
    const session=await db.mobileAuthSession.create({data:{user_id:user.id,device_id:'synthetic-watch',device_platform:'WEAR_OS',access_token_hash:randomUUID(),refresh_token_hash:randomUUID(),access_expires_at:new Date(Date.now()+3600000),refresh_expires_at:new Date(Date.now()+7200000)}});
    if(mapped)await db.firebaseIdentity.create({data:{user_id:user.id,installation_id:'synthetic',source_id:'synthetic',project_id:'synthetic',uid:randomUUID()}});
    const provider={authenticate:async identity=>({identity,authenticatedAt:new Date()}),inspect:async identity=>({identity,status:'present'}),delete:async()=>{throw Error('synthetic outage');}};
    const coordinator=new AccountDeletionCoordinator(db,provider,100);
    return {user,goal,session,coordinator,proof:mapped?await coordinator.authenticate(user.id,'synthetic'):null,operation:randomUUID(),writeOperation:randomUUID()};
  }
  async function writer(f,kind) {
    if(kind==='wear') {
      const mutation=watch.parseWatchMutation({type:'metric.upsert',payload:{local_date:today,weight_grams:84000,expected_revision:null}},{timezone:'UTC'});
      const result=await watch.executeWatchMutation({userId:f.user.id,mobileAuthSessionId:f.session.id,operationId:f.writeOperation,mutation});
      return {status:result.status,body:result.body};
    }
    const res={statusCode:200,status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
    if(kind==='metric')await handler(metrics,'/')({user:f.user,body:{date:today,weight:84},headers:{'x-client-operation-id':f.writeOperation}},res);
    else {
      const zip=new AdmZip();const [y,m,d]=today.split('-');
      zip.addFile('weights.csv',Buffer.from(`Date,Weight,Last Updated,Deleted\n${m}/${d}/${y},84,,\n`));
      await handler(imports,'/loseit/execute')({user:f.user,file:{buffer:zip.toBuffer()},body:{weight_unit:'KG',food_conflict_mode:'MERGE',weight_conflict_mode:'OVERWRITE',include_body_fat:false}},res);
    }
    return {status:res.statusCode,body:res.body};
  }
  async function snapshot(f) {
    return {metrics:await db.bodyMetric.findMany({where:{user_id:f.user.id}}),goal:await db.goal.findUnique({where:{id:f.goal.id}}),sync:await db.syncChange.findMany({where:{user_id:f.user.id},orderBy:{id:'asc'}}),operations:await db.clientOperation.findMany({where:{user_id:f.user.id}})};
  }
  async function blockedBy(pid) {
    const until=Date.now()+3500;
    while(Date.now()<until) {
      const result=await admin.query('SELECT pid, wait_event_type, wait_event, query, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',[pid]);
      if(result.rows.length)return result.rows;
      await new Promise(setImmediate);
    }
    throw Error('No PostgreSQL waiter observed for blocker '+pid);
  }
  for(const kind of ['metric','import','wear']) {
    const f=await fixture(); const held=deferred(),release=deferred(); let pid;
    planning.lockCaloriePlanningInputs=async(tx,id)=>{await originalLock(tx,id);pid=(await tx.$queryRawUnsafe('SELECT pg_backend_pid() AS pid'))[0].pid;held.resolve();await release.promise;};
    const work=writer(f,kind); let deletion;
    try {
      await Promise.race([held.promise,work.then(x=>{throw Error('writer ended before barrier '+JSON.stringify(x));})]);
      deletion=f.coordinator.begin(f.operation,f.proof);
      const waits=await blockedBy(pid);
      assert.equal((await snapshot(f)).metrics.length,0);
      release.resolve();assert.equal((await work).status,200);assert.equal(await deletion,'pending_provider');
      const state=await snapshot(f);assert.equal(state.metrics.length,1);assert.equal(state.metrics[0].weight_grams,84000);assert.equal(state.goal.start_weight_grams,84000);assert.ok(state.sync.some(s=>s.entity_type==='goal'));
      assert.equal(state.operations.length,kind==='import'?0:1);
      if(kind!=='import'){assert.equal(state.operations[0].operation_id,f.writeOperation);assert.equal(state.operations[0].response_status,200);assert.ok(state.operations[0].completed_at);}
      assert.equal((await db.user.findUnique({where:{id:f.user.id}})).deletion_pending,true);
      observations.push({kind,scenario:'writer-first',outcome:'pass',waits});
    }finally{release.resolve();planning.lockCaloriePlanningInputs=originalLock;await Promise.allSettled([work,...(deletion?[deletion]:[])]);}
    const pending=await fixture();await pending.coordinator.begin(pending.operation,pending.proof);const before=await snapshot(pending);
    let result;try{result=await writer(pending,kind);}catch(e){result={status:'rejected',code:e.code};}
    assert.notEqual(result.status,200);assert.deepEqual(await snapshot(pending),before);
    observations.push({kind,scenario:'intent-first',outcome:'pass',result});
    const abort=await fixture();const pristine=await snapshot(abort);
    db.$transaction=(callback,options)=>originalTransaction(async tx=>{await callback(tx);throw Error('synthetic abort after domain and receipt writes');},options);
    try{await writer(abort,kind);}catch{}
    db.$transaction=originalTransaction;assert.deepEqual(await snapshot(abort),pristine);
    assert.equal((await writer(abort,kind)).status,200);const committed=await snapshot(abort);
    assert.equal((await writer(abort,kind)).status,200);assert.deepEqual(await snapshot(abort),committed);
    if(kind!=='import'){
      const saved=abort.writeOperation;abort.writeOperation=randomUUID();
      if(kind==='wear'){const conflict=await writer(abort,kind);assert.equal(conflict.status,409);assert.equal(conflict.body.code,'ENTITY_CONFLICT');}
      abort.writeOperation=saved;
    }
    observations.push({kind,scenario:'abort-retry-replay',outcome:'pass',operation:abort.writeOperation,receiptSupported:kind!=='import'});
    const local=await fixture(false);assert.equal((await writer(local,kind)).status,200);assert.equal((await db.user.findUnique({where:{id:local.user.id}})).deletion_pending,false);
    observations.push({kind,scenario:'ordinary-local',outcome:'pass'});
    console.log('PASS '+kind+': writer-first, intent-first, abort/retry/replay, ordinary local');
  }
  console.log(JSON.stringify({schema,url,observations},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(database)await database.disconnectDatabase();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();fs.writeFileSync(path.join(__dirname,'ordering-results.json'),JSON.stringify({schema,url,observations,exitCode:process.exitCode||0,cleanedSchema:true},null,2));});
