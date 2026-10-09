# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: quantity.spec.ts >> simulated visual viewport shrink add
- Location: quantity.spec.ts:43:38

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 420
Received:    443.609375

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - button [ref=e4] [cursor=pointer]: Skip to main content
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e11]:
          - banner [ref=e12]:
            - generic [ref=e13]:
              - button [ref=e15] [cursor=pointer]:
                - generic [ref=e16]: 
              - heading [level=1] [ref=e17]: Food log
              - toolbar [ref=e18]:
                - button [ref=e19] [cursor=pointer]:
                  - generic [ref=e20]: 
                - button [ref=e21] [cursor=pointer]:
                  - generic [ref=e22]: 
          - generic [ref=e24]:
            - toolbar [ref=e28]:
              - button [ref=e29] [cursor=pointer]:
                - generic [ref=e30]: 
              - button [ref=e31] [cursor=pointer]:
                - generic [ref=e32]: Today
                - generic [ref=e33]: 
              - button [disabled]:
                - generic [ref=e34]: 
            - main [ref=e41]:
              - generic [ref=e44]:
                - generic [ref=e45]:
                  - heading [level=2] [ref=e47]: Meals
                  - button [ref=e48] [cursor=pointer]:
                    - generic [ref=e49]: 
                    - generic [ref=e50]: Copy day
                - generic [ref=e51]:
                  - generic [ref=e53]:
                    - generic [ref=e54]:
                      - generic [ref=e56]: Breakfast
                      - generic [ref=e57]:
                        - generic [ref=e58]: 100 kcal
                        - button [ref=e59] [cursor=pointer]:
                          - generic [ref=e60]: 
                    - generic [ref=e61]:
                      - generic [ref=e62]:
                        - generic [ref=e63]:
                          - generic [ref=e64]: Synthetic existing oats
                          - generic [ref=e65]: 0.25 cups
                        - generic [ref=e66]:
                          - generic [ref=e67]: 100 kcal
                          - button [ref=e68] [cursor=pointer]:
                            - generic [ref=e69]: 
                          - button [ref=e70] [cursor=pointer]:
                            - generic [ref=e71]: 
                      - generic [ref=e72]:
                        - button [ref=e73] [cursor=pointer]:
                          - generic [ref=e74]: 
                          - generic [ref=e75]: Copy meal
                        - button [ref=e76] [cursor=pointer]:
                          - generic [ref=e77]: 
                          - generic [ref=e78]: Save as recipe
                  - generic [ref=e81]:
                    - generic [ref=e83]: Morning Snack
                    - generic [ref=e85]: No entries
                  - generic [ref=e88]:
                    - generic [ref=e90]: Lunch
                    - generic [ref=e92]: No entries
                  - generic [ref=e95]:
                    - generic [ref=e97]: Afternoon Snack
                    - generic [ref=e99]: No entries
                  - generic [ref=e102]:
                    - generic [ref=e104]: Dinner
                    - generic [ref=e106]: No entries
                  - generic [ref=e109]:
                    - generic [ref=e111]: Evening Snack
                    - generic [ref=e113]: No entries
        - tablist [ref=e115]:
          - tab [selected] [ref=e117] [cursor=pointer]:
            - generic [ref=e118]:
              - generic [ref=e120]: 
              - generic [ref=e122]: 
            - generic [ref=e124]: Today
          - tab [ref=e127] [cursor=pointer]:
            - generic [ref=e128]:
              - generic [ref=e130]: 
              - generic [ref=e132]: 
            - generic [ref=e134]: Progress
      - button [ref=e136] [cursor=pointer]:
        - generic [ref=e137]: 
        - generic [ref=e138]: Add food
  - dialog [ref=e140]:
    - dialog "Add food" [ref=e145]:
      - button "Close add food" [ref=e148] [cursor=pointer]:
        - generic [ref=e150]: 
      - generic [ref=e151]:
        - generic [ref=e152]:
          - heading "Add food" [level=1] [ref=e153]
          - generic [ref=e154]: Jul 21, 2026 | Lunch
        - generic [ref=e155]:
          - generic [ref=e156]: Meal
          - combobox "Select meal" [ref=e158] [cursor=pointer]:
            - generic [ref=e160]: Lunch
            - generic [ref=e161]: 
        - radiogroup "Add food method" [ref=e162]:
          - radio "Quick" [ref=e163] [cursor=pointer]:
            - generic [ref=e164]: Quick
          - radio "Search" [checked] [ref=e165] [cursor=pointer]:
            - generic [ref=e166]: Search
        - generic [ref=e168]:
          - generic [ref=e169]:
            - generic [ref=e170]: Search foods
            - button "Saved foods" [ref=e171] [cursor=pointer]:
              - generic [ref=e172]:
                - generic [ref=e173]: 
                - generic [ref=e174]: Saved foods
          - generic [ref=e175]:
            - textbox "Search foods" [ref=e177]:
              - /placeholder: Search food name or brand
              - text: Synthetic quarter-cup oats
            - button "Scan" [ref=e178] [cursor=pointer]:
              - generic [ref=e179]:
                - generic [ref=e180]: 
                - generic [ref=e181]: Scan
          - generic [ref=e183]:
            - generic [ref=e184]:
              - button "Back to food results" [ref=e185] [cursor=pointer]:
                - generic [ref=e187]: 
              - generic [ref=e188]:
                - heading "Synthetic quarter-cup oats" [level=3] [ref=e189]
                - generic [ref=e190]: Saved food | 100 kcal per serving
            - generic [ref=e191]:
              - generic [ref=e192]:
                - generic [ref=e193]: Amount
                - generic [ref=e194]: serving
              - generic [ref=e195]:
                - button "Decrease Amount by 0.25" [disabled]:
                  - generic [ref=e197]: 
                - textbox "Amount" [ref=e199]: "0.125"
                - button "Increase Amount by 0.25" [ref=e200] [cursor=pointer]:
                  - generic [ref=e202]: 
              - generic [ref=e203]: Use +/- 0.25 serving; type any positive decimal.
            - generic "13 kcal, 0.125 servings (0.031 cups)" [ref=e204]:
              - generic [ref=e205]: 13 kcal
              - generic [ref=e206]: 0.125 servings (0.031 cups)
            - generic [ref=e207]:
              - button "Add another" [ref=e208] [cursor=pointer]:
                - generic [ref=e209]:
                  - generic [ref=e210]: 
                  - generic [ref=e211]: Add another
              - button "Add & close" [ref=e212] [cursor=pointer]:
                - generic [ref=e213]:
                  - generic [ref=e214]: 
                  - generic [ref=e215]: Add & close
```

# Test source

```ts
  1  | import { test, expect, hideTransientPwaNotices, activateFixtureOffline, expectApiFailure } from '../quantity-448/e2e/expo-web/fixtures';
  2  | import { writeFile } from 'node:fs/promises';
  3  | 
  4  | const food={id:901,type:'FOOD',name:'Synthetic quarter-cup oats',serving_size_quantity:0.25,serving_unit_label:'cup',calories_per_serving:100,is_pinned:false};
  5  | const initial={id:701,name:'Synthetic existing oats',meal_period:'BREAKFAST',calories:100,servings_consumed:1,serving_size_quantity_snapshot:0.25,serving_unit_label_snapshot:'cup',calories_per_serving_snapshot:100,grams_per_measure_snapshot:20,grams_total_snapshot:20};
  6  | async function setup(page:any,ux:any) {
  7  |   await ux.install('populated',{foodEntries:[initial]});
  8  |   const rows:any[]=[{...initial}];const traffic:any[]=[];const dedup=new Map();let fail=false;let nextId=702;
  9  |   await page.addInitScript(()=>{(window as any).__quantityEvents=[];for(const type of ['focusin','focusout','input','change','pointerdown','click'])document.addEventListener(type,(e:any)=>{const t=e.target;if(t instanceof HTMLInputElement || t.closest?.('[role=button]'))(window as any).__quantityEvents.push({type,value:t.value,label:t.getAttribute?.('aria-label'),text:t.closest?.('[role=button]')?.textContent});},true);});
  10 |   await page.route('**/api/v1/my-foods*',route=>route.fulfill({json:new URL(route.request().url()).pathname.endsWith('/library')?{items:[food],next_cursor:null}:[food]}));
  11 |   await page.route('**/api/v1/food/search?*',route=>route.fulfill({json:{items:[],provider:'usda'}}));
  12 |   await page.route(/\/api\/v1\/food(?:\?|\/\d+|$)/,async route=>{
  13 |     const req=route.request();const method=req.method();if(method==='GET')return route.fulfill({json:rows});
  14 |     const payload=req.postDataJSON();const key=req.headers()['idempotency-key']??payload.operation_id;
  15 |     if(fail){traffic.push({method,payload,key,status:503});return route.fulfill({status:503,json:{error:'Synthetic outage',retryable:true}});}
  16 |     let result=dedup.get(key);if(!result){
  17 |       if(method==='POST') {result={...initial,...payload,id:nextId++,name:food.name,serving_size_quantity_snapshot:food.serving_size_quantity,serving_unit_label_snapshot:food.serving_unit_label,calories:Math.round(payload.servings_consumed*100),grams_total_snapshot:payload.servings_consumed*20};rows.push(result);}
  18 |       else {result=rows.find(r=>r.id===Number(new URL(req.url()).pathname.split('/').pop()));Object.assign(result,payload);result.calories=Math.round(result.servings_consumed*100);result.grams_total_snapshot=result.servings_consumed*20;}
  19 |       if(key)dedup.set(key,result);
  20 |     }
  21 |     traffic.push({method,payload,key,status:method==='POST'?201:200,response:{...result}});await route.fulfill({status:method==='POST'?201:200,json:result});
  22 |   });
  23 |   await page.goto('/food-log');await hideTransientPwaNotices(page);await expect(page.getByRole('button',{name:'Edit Synthetic existing oats',exact:true})).toBeVisible();
  24 |   return {rows,traffic,setFail:(v:boolean)=>fail=v};
  25 | }
  26 | async function edit(page:any,name=initial.name){await page.getByRole('button',{name:`Edit ${name}`,exact:true}).click();return page.getByRole('dialog',{name:'Edit food',exact:true});}
  27 | async function add(page:any){await page.getByRole('button',{name:'Add food',exact:true}).click();const d=page.getByRole('dialog',{name:'Add food',exact:true});await d.getByRole('radio',{name:'Search',exact:true}).click();await d.getByLabel('Search foods').fill(food.name);await d.getByText(food.name,{exact:true}).click();return d;}
  28 | async function saveEvidence(page:any,info:any,record:any){record.events=await page.evaluate(()=>(window as any).__quantityEvents);record.browser=page.context().browser().version();await writeFile(info.outputPath('observations.json'),JSON.stringify(record,null,2));}
  29 | 
  30 | for(const text of ['0.125','1.3','1,3']) for(const mode of ['immediate','blur']) {
  31 |  test(`existing ${text} ${mode}`,async({page,ux},info)=>{const state=await setup(page,ux);let d=await edit(page);const input=d.getByRole('textbox',{name:'Amount',exact:true});await input.fill(text);if(mode==='blur')await input.press('Tab');await d.getByRole('button',{name:'Save',exact:true}).click();await expect(d).toBeHidden();expect(state.traffic[0].payload.servings_consumed).toBe(Number(text.replace(',','.'))/0.25);(state as any).eventsBeforeReload=await page.evaluate(()=>(window as any).__quantityEvents);await page.reload();await hideTransientPwaNotices(page);d=await edit(page);await expect(d.getByRole('textbox',{name:'Amount',exact:true})).toHaveValue(text.replace(',','.'));await saveEvidence(page,info,state);});
  32 |  test(`add ${text} ${mode}`,async({page,ux},info)=>{const state=await setup(page,ux);const d=await add(page);const input=d.getByRole('textbox',{name:'Amount',exact:true});await input.fill(text);if(mode==='blur')await input.press('Tab');await d.getByRole('button',{name:'Add & close',exact:true}).click();await expect(d).toBeHidden();expect(state.traffic[0].payload.servings_consumed).toBe(Number(text.replace(',','.')));(state as any).eventsBeforeReload=await page.evaluate(()=>(window as any).__quantityEvents);await page.reload();await hideTransientPwaNotices(page);const e=await edit(page,food.name);await expect(e.getByRole('textbox',{name:'Amount',exact:true})).toHaveValue(String(Number(text.replace(',','.'))*0.25));await saveEvidence(page,info,state);});
  33 | }
  34 | 
  35 | test('validation, button increment, six-place edit boundary',async({page,ux},info)=>{const state=await setup(page,ux);let d=await edit(page);const input=d.getByRole('textbox',{name:'Amount',exact:true});for(const v of ['', 'invalid','0','-1']){await input.fill(v);await d.getByRole('button',{name:'Save',exact:true}).click();await expect(d.getByRole('alert')).toContainText('Amount must be a positive number');expect(state.traffic).toHaveLength(0);}await input.fill('0.125');await d.getByRole('button',{name:'Increase Amount by 0.25',exact:true}).click();await expect(input).toHaveValue('0.375');await d.getByRole('button',{name:'Decrease Amount by 0.25',exact:true}).click();await expect(input).toHaveValue('0.125');await input.fill('0.250001');await d.getByRole('button',{name:'Save',exact:true}).click();await expect(d).toBeHidden();await saveEvidence(page,info,state);});
  36 | 
  37 | test('offline add and edit replay retain decimals and identities',async({page,ux},info)=>{const state=await setup(page,ux);state.setFail(true);expectApiFailure(page,{method:'POST',pathname:'/api/v1/food',status:503});expectApiFailure(page,{method:'PATCH',pathname:'/api/v1/food/701',status:503});let d=await add(page);await d.getByRole('textbox',{name:'Amount',exact:true}).fill('0.125');await d.getByRole('button',{name:'Add & close',exact:true}).click();await expect(d).toBeHidden();d=await edit(page);await d.getByRole('textbox',{name:'Amount',exact:true}).fill('1,3');await d.getByRole('button',{name:'Save',exact:true}).click();await expect(d).toBeHidden();const queued=await page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const open=indexedDB.open('calibrate-offline');open.onsuccess=()=>{const db=open.result;const r=db.transaction('queued_mutations').objectStore('queued_mutations').getAll();r.onsuccess=()=>{resolve(r.result);db.close()};r.onerror=()=>reject(r.error)};open.onerror=()=>reject(open.error)}));expect(queued).toHaveLength(2);await page.reload();await hideTransientPwaNotices(page);state.setFail(false);await activateFixtureOffline(page);await page.context().setOffline(false);await expect.poll(()=>state.rows.length).toBe(2);await expect.poll(()=>state.rows[0].servings_consumed).toBe(5.2);expect(state.rows[1].servings_consumed).toBe(0.125);await saveEvidence(page,info,{...state,queued});});
  38 | 
  39 | test('observed one-millionth edit is omitted from request',async({page,ux},info)=>{
  40 |  const state=await setup(page,ux);let d=await edit(page);let input=d.getByRole('textbox',{name:'Amount',exact:true});await input.fill('0.250001');await expect(input).toHaveValue('0.250001');await page.screenshot({path:info.outputPath('typed.png')});await d.getByRole('button',{name:'Save',exact:true}).click();await expect(d).toBeHidden();const saveEvents=await page.evaluate(()=>(window as any).__quantityEvents);expect(state.traffic[0].payload).not.toHaveProperty('servings_consumed');await page.reload();await hideTransientPwaNotices(page);d=await edit(page);input=d.getByRole('textbox',{name:'Amount',exact:true});await expect(input).toHaveValue('0.25');await page.screenshot({path:info.outputPath('reopened.png')});await saveEvidence(page,info,{...state,typed:'0.250001',reopened:await input.inputValue(),saveEvents});
  41 | });
  42 | 
  43 | for(const flow of ['edit','add'])test(`simulated visual viewport shrink ${flow}`,async({page,ux},info)=>{
  44 |  const state=await setup(page,ux);const d=flow==='edit'?await edit(page):await add(page);const input=d.getByRole('textbox',{name:'Amount',exact:true});await input.fill('0.125');await input.focus();await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>420});window.visualViewport!.dispatchEvent(new Event('resize'));});
> 45 |  await expect.poll(async()=>{const b=await input.boundingBox();return b!.y+b!.height}).toBeLessThanOrEqual(420);const focusedBox=await input.boundingBox();await page.screenshot({path:info.outputPath('viewport-simulation.png')});const button=d.getByRole('button',{name:flow==='edit'?'Save':'Add & close',exact:true});await button.scrollIntoViewIfNeeded();const buttonBox=await button.boundingBox();expect(buttonBox!.y+buttonBox!.height).toBeLessThanOrEqual(420);await button.click();await expect(d).toBeHidden();await saveEvidence(page,info,{...state,simulation:'visualViewport.height=420, layout viewport 390x844; not native keyboard',focusedBox,buttonBox});
     |                                                                                        ^ Error: expect(received).toBeLessThanOrEqual(expected)
  46 | });
  47 | 
  48 | 
```