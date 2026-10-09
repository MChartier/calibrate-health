import { test, expect, hideTransientPwaNotices } from '../quantity-fix-448/e2e/expo-web/fixtures';
import { setup, add, edit } from './fixture';
import { writeFile } from 'node:fs/promises';
async function settle(page:any){await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));});}
test('short selected-food sheet',async({page,ux},info)=>{
 const state=await setup(page,ux);const d=await add(page);const amount=d.getByRole('textbox',{name:'Amount',exact:true});await amount.fill('0.125');
 await settle(page);await page.screenshot({path:info.outputPath('normal.png')});await page.setViewportSize({width:390,height:420});await amount.focus();await amount.scrollIntoViewIfNeeded();
 const geometry=await amount.evaluate((el:HTMLElement)=>{const parents=[];let p:HTMLElement|null=el;while(p){const r=p.getBoundingClientRect();parents.push({testid:p.getAttribute('data-testid'),y:r.y,height:r.height,overflow:getComputedStyle(p).overflow,scrollTop:p.scrollTop});p=p.parentElement;}return{parents,active:document.activeElement===el,visualHeight:visualViewport?.height};});
 await settle(page);await page.screenshot({path:info.outputPath('short.png')});await writeFile(info.outputPath('observations.json'),JSON.stringify({geometry,browser:page.context().browser()!.version(),events:await page.evaluate(()=>(window as any).__quantityEvents)},null,2));
});
test('supported precision after save and reload',async({page,ux},info)=>{
 const state=await setup(page,ux);let d=await edit(page);await d.getByRole('textbox',{name:'Amount',exact:true}).fill('0.250001');await d.getByRole('button',{name:'Save',exact:true}).click();await expect(d).toBeHidden();const events=await page.evaluate(()=>(window as any).__quantityEvents);await page.reload();await hideTransientPwaNotices(page);d=await edit(page);const amount=d.getByRole('textbox',{name:'Amount',exact:true});await amount.focus();await settle(page);await page.screenshot({path:info.outputPath('reopened.png')});await writeFile(info.outputPath('observations.json'),JSON.stringify({traffic:state.traffic,value:await amount.inputValue(),events,browser:page.context().browser()!.version()},null,2));
});

