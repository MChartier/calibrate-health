const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = process.cwd();
require(path.join(root, 'node_modules/ts-node/register'));
const dbPath = require.resolve(path.join(root, 'src/config/database'));
const stub = new Module(dbPath); stub.exports = {}; stub.loaded = true; require.cache[dbPath] = stub;
const { getEffectiveFoodDay } = require(path.join(root, 'src/services/foodTracking'));
const now = new Date('2026-07-21T19:00:00Z');
const row = {id: 1, user_id: 17, local_date: new Date('2026-07-20T00:00:00Z'),status: 'COMPLETE',origin:'USER',completed_at:new Date('2026-07-20T19:00:00Z'),updated_at:new Date('2026-07-20T19:00:00Z'),comparison_target_kcal:2000,comparison_maintenance_kcal:2500,comparison_captured_at:new Date('2026-07-20T19:00:00Z')};
const db={foodLogDay:{findUnique:async()=>row},foodLog:{findMany:async()=>[{calories:1800}]}};
(async()=>{
 const valid=await getEffectiveFoodDay(17,row.local_date,now,db);
 row.comparison_target_kcal=null;row.comparison_maintenance_kcal=null;row.comparison_captured_at=null;
 const missing=await getEffectiveFoodDay(17,row.local_date,now,db);
 fs.writeFileSync(process.argv[2],JSON.stringify({valid,missing},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1});
