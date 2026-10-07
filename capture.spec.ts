import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import { expect, test, hideTransientPwaNotices } from './fixtures';
const dir = process.env.SAVED_TARGET_EVIDENCE!;
const side = process.env.SAVED_TARGET_SIDE!;
const responses = JSON.parse(fs.readFileSync(path.join(dir, side + '-responses.json'),'utf8'));
for (const state of ['valid', 'missing']) {
 test('capture ' + state, async ({page, ux, browser}, info) => {
  const bundles: Record<string,string> = {};
  page.on('response', async response => {
   if (response.url().includes('/_expo/') && response.url().split('?')[0].endsWith('.js')) {
    const bytes = await response.body();
    bundles[new URL(response.url()).pathname] = crypto.createHash('sha256').update(bytes).digest('hex');
   }
  });
  await page.emulateMedia({colorScheme:'light'});
  await ux.install('populated',{foodDayStatus:'COMPLETE',foodEntriesByDate:{'2026-07-20':[{id:31,meal_period:'BREAKFAST',name:'Synthetic daily intake',calories:1800}]}});
  await page.route('**/api/v1/food-days?*',route=>route.fulfill({json:responses[state]}));
  await page.goto('/today?date=2026-07-20');
  const expected = side === 'after' && state === 'valid' ? /Daily balance\. 200 kcal remaining/ : /Daily balance\. Saved target unavailable/;
  await expect(page.getByLabel(expected)).toBeVisible();
  await hideTransientPwaNotices(page);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(dir,side+'-'+state+'.png'),fullPage:true,animations:'disabled'});
  for (const [url,digest] of Object.entries(bundles)) {
   expect(crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(),'mobile/dist',url))).digest('hex')).toBe(digest);
  }
  expect(Object.keys(bundles).length).toBeGreaterThan(0);
  fs.writeFileSync(path.join(dir,side+'-'+state+'-capture.json'),JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browser:browser.version(),viewport:info.project.use.viewport,side,state,checkedAt:new Date().toISOString(),bundles},null,2));
 });
}
