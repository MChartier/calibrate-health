// One-off integration evidence harness. Copy into e2e/expo-web to run; retain only on the evidence ref.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, hideTransientPwaNotices } from './fixtures';
const output = 'docs/pr-screenshots/issue-408/integrated-4728d4f';
const fixture = readFileSync(output + '/fixture.json', 'utf8');
for (const [width, colorScheme] of [[1440, 'light'], [1440, 'dark'], [1023, 'light'], [1024, 'light']] as const) {
  test('integrated calendar ' + width + ' ' + colorScheme, async ({ page, ux, browser }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme }); await ux.install('populated');
    await page.route('**/api/v1/food-days/range?*', route => route.fulfill({contentType:'application/json',body:fixture}));
    await page.goto('/today'); await hideTransientPwaNotices(page);
    const rail=page.getByTestId('web-navigation-rail');
    if(width>=1024) expect((await rail.boundingBox())!.width).toBe(88);
    else await expect(rail).toHaveCount(0);
    const choose=page.getByRole('button',{name:'Choose date',exact:true});
    await choose.click(); await page.getByTestId('calendar-day-2026-07-09').click(); await choose.click();
    await expect(page.getByTestId('calendar-day-2026-07-09')).toHaveAccessibleName(/completed, below target, at or above maintenance, selected$/);
    await expect(page.getByTestId('calendar-day-2026-07-17')).toHaveAccessibleName(/completed, comparison unavailable/);
    for(let n=1;n<=17;n++) await expect(page.getByTestId('calendar-date-badge-2026-07-'+String(n).padStart(2,'0'))).toHaveText(String(n));
    await page.evaluate(()=>document.fonts.ready);
    const badges=await page.locator('[data-testid^="calendar-date-badge-"]').evaluateAll(elements=>elements.map(element=>{
      const r=element.getBoundingClientRect(); const c=getComputedStyle(element);
      return {id:element.getAttribute('data-testid'),text:element.textContent,x:r.x,y:r.y,width:r.width,height:r.height,background:c.backgroundColor};
    }));
    const dialog=await page.getByRole('dialog',{name:'Calendar'}).boundingBox();
    let capture!: Buffer;
    await expect(async()=>{const first=await page.screenshot();await page.waitForTimeout(200);capture=await page.screenshot();expect(capture.equals(first)).toBe(true);}).toPass({timeout:10000});
    const prefix=output+'/desktop-'+width+'-'+colorScheme;
    writeFileSync(prefix+'.png',capture);
    writeFileSync(prefix+'.capture.json',JSON.stringify({source:'872f7b5f00c5ace203e1d5c1b15b201c84e9dd48',tree:'d4475f7630894ddd8fe3f87382a075615c182d49',viewport:page.viewportSize(),colorScheme,browser:'Chrome desktop browser on Windows; not emulator/device',browserVersion:browser.version(),capturedAt:new Date().toISOString(),frozenNow:'2026-07-21T19:00:00.000Z',timezone:'America/Los_Angeles',locale:'en-US',deviceScaleFactor:1,reducedMotion:'reduce',selectedDate:'2026-07-09',dialog,badges},null,2)+String.fromCharCode(10));
    await page.keyboard.press('Escape'); await expect(choose).toBeFocused();
  });
}
