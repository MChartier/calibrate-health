import { test, expect, hideTransientPwaNotices, activateFixtureOffline, expectApiFailure } from '../quantity-fix-448/e2e/expo-web/fixtures';
import { writeFile } from 'node:fs/promises';

const food={id:901,type:'FOOD',name:'Synthetic quarter-cup oats',serving_size_quantity:0.25,serving_unit_label:'cup',calories_per_serving:100,is_pinned:false};
const initial={id:701,name:'Synthetic existing oats',meal_period:'BREAKFAST',calories:100,servings_consumed:1,serving_size_quantity_snapshot:0.25,serving_unit_label_snapshot:'cup',calories_per_serving_snapshot:100,grams_per_measure_snapshot:20,grams_total_snapshot:20};
export async function setup(page:any,ux:any) {
  await ux.install('populated',{foodEntries:[initial]});
  const rows:any[]=[{...initial}];const traffic:any[]=[];const dedup=new Map();let fail=false;let loseAck=false;let nextId=702;
  await page.addInitScript(()=>{(window as any).__quantityEvents=[];for(const type of ['focusin','focusout','input','change','pointerdown','click'])document.addEventListener(type,(e:any)=>{const t=e.target;if(t instanceof HTMLInputElement || t.closest?.('[role=button]'))(window as any).__quantityEvents.push({type,value:t.value,label:t.getAttribute?.('aria-label'),text:t.closest?.('[role=button]')?.textContent});},true);});
  await page.route('**/api/v1/my-foods*',route=>route.fulfill({json:new URL(route.request().url()).pathname.endsWith('/library')?{items:[food],next_cursor:null}:[food]}));
  await page.route('**/api/v1/food/search?*',route=>route.fulfill({json:{items:[],provider:'usda'}}));
  await page.route(/\/api\/v1\/food(?:\?|\/\d+|$)/,async route=>{
    const req=route.request();const method=req.method();if(method==='GET')return route.fulfill({json:rows});
    const payload=req.postDataJSON();const key=req.headers()['x-client-operation-id']??payload.operation_id;
    if(fail){traffic.push({method,payload,key,status:503});return route.fulfill({status:503,json:{error:'Synthetic outage',retryable:true}});}
    let result=dedup.get(key);if(!result){
      if(method==='POST') {result={...initial,...payload,id:nextId++,name:food.name,serving_size_quantity_snapshot:food.serving_size_quantity,serving_unit_label_snapshot:food.serving_unit_label,calories:Math.round(payload.servings_consumed*100),grams_total_snapshot:payload.servings_consumed*20};rows.push(result);}
      else {result=rows.find(r=>r.id===Number(new URL(req.url()).pathname.split('/').pop()));Object.assign(result,payload);result.calories=Math.round(result.servings_consumed*100);result.grams_total_snapshot=result.servings_consumed*20;}
      if(key)dedup.set(key,result);
    }
    if(loseAck){traffic.push({method,payload,key,status:503,committed:true});return route.fulfill({status:503,json:{error:'Synthetic lost acknowledgement after commit',retryable:true}});}traffic.push({method,payload,key,status:method==='POST'?201:200,response:{...result}});await route.fulfill({status:method==='POST'?201:200,json:result});
  });
  await page.goto('/food-log');await hideTransientPwaNotices(page);await expect(page.getByRole('button',{name:'Edit Synthetic existing oats',exact:true})).toBeVisible();
  return {rows,traffic,setFail:(v:boolean)=>fail=v,setAck:(v:boolean)=>loseAck=v};
}
export async function edit(page:any,name=initial.name){await page.getByRole('button',{name:`Edit ${name}`,exact:true}).click();return page.getByRole('dialog',{name:'Edit food',exact:true});}
export async function add(page:any){await page.getByRole('button',{name:'Add food',exact:true}).click();const d=page.getByRole('dialog',{name:'Add food',exact:true});await d.getByRole('radio',{name:'Search',exact:true}).click();await d.getByLabel('Search foods').fill(food.name);await d.getByText(food.name,{exact:true}).click();return d;}
async function saveEvidence(page:any,info:any,record:any){record.events=await page.evaluate(()=>(window as any).__quantityEvents);record.browser=page.context().browser().version();await writeFile(info.outputPath('observations.json'),JSON.stringify(record,null,2));}


