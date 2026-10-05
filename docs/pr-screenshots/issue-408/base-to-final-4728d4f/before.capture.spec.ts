// Evidence-only baseline harness: copy into e2e/expo-web/pr410-base-capture.spec.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, hideTransientPwaNotices } from './fixtures';
import { calibrateDesignTokens } from '../../shared/designTokens';
const output='docs/pr-screenshots/issue-408/base-to-final-4728d4f';
const fixture=readFileSync(output+'/fixture.json','utf8');
for(const colorScheme of ['light','dark'] as const) {
 test('actual master baseline calendar '+colorScheme,async({page,ux,browser})=>{
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({colorScheme});await ux.install('populated');
  await page.route('**/api/v1/food-days/range?*',route=>route.fulfill({contentType:'application/json',body:fixture}));
  await page.goto('/today');await hideTransientPwaNotices(page);
  expect((await page.getByTestId('web-navigation-rail').boundingBox())!.width).toBe(88);
  const choose=page.getByRole('button',{name:'Choose date',exact:true});await choose.click();await page.getByTestId('calendar-day-2026-07-09').click();await choose.click();
  await expect(page.getByTestId('calendar-day-2026-07-09')).toHaveAccessibleName(/Jul 9, 2026, completed$/);
  const green=calibrateDesignTokens.schemes[colorScheme].success;
  const rgb='rgb('+[1,3,5].map(i=>parseInt(green.slice(i,i+2),16)).join(', ')+')';
  for(let n=1;n<=17;n++){
   const date='2026-07-'+String(n).padStart(2,'0');
   await expect(page.getByTestId('calendar-date-badge-'+date)).toHaveText(String(n));
   await expect(page.getByTestId('calendar-date-badge-'+date)).toHaveCSS('background-color',rgb);
   await expect(page.getByTestId('calendar-day-'+date)).toHaveAccessibleName(/completed/);
  }
  await expect(page.getByText('Complete',{exact:true})).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  const badges=await page.locator('[data-testid^="calendar-date-badge-"]').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect();return{id:element.getAttribute('data-testid'),text:element.textContent,x:r.x,y:r.y,width:r.width,height:r.height,background:getComputedStyle(element).backgroundColor};}));
  let pixels!:Buffer;await expect(async()=>{const first=await page.screenshot();await page.waitForTimeout(200);pixels=await page.screenshot();expect(pixels.equals(first)).toBe(true);}).toPass({timeout:10000});
  writeFileSync(output+'/before-'+colorScheme+'.png',pixels);
  writeFileSync(output+'/before-'+colorScheme+'.capture.json',JSON.stringify({source:'4728d4f75b70e6440a9778a42cd2224a300db725',viewport:page.viewportSize(),colorScheme,browser:'Chrome desktop browser on Windows; not emulator/device',browserVersion:browser.version(),capturedAt:new Date().toISOString(),frozenNow:'2026-07-21T19:00:00.000Z',timezone:'America/Los_Angeles',locale:'en-US',deviceScaleFactor:1,reducedMotion:'reduce',selectedDate:'2026-07-09',badges},null,2)+'\n');
  await page.keyboard.press('Escape');await expect(choose).toBeFocused();
 });
}
