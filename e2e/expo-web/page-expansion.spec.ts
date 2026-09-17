import { expect, hideTransientPwaNotices, test } from './fixtures';
import { expectNoBlockingAccessibilityViolations } from './ux-a11y';
import { PLAN_CHECK_RECOMMENDATION_STATUS } from './plan-check.fixture';
import { applyTwoHundredPercentText } from './text-scaling';

test('Food log expands below the date and restores its source, scroll and focus', async ({ page, ux }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await ux.install('populated', { foodDayStatus: 'OPEN' });
  await page.goto('/today');
  await hideTransientPwaNotices(page);
  const source = page.getByTestId('today-food-preview');
  const date = page.getByRole('toolbar', { name: 'Food log date' });
  const before = await source.boundingBox();
  const dateBefore = await date.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('food-overview.png') });
  await source.click();
  const pane = page.getByTestId('expanded-food');
  await expect(pane).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse Food log' })).toBeFocused();
  const viewport = (await page.getByTestId('page-expansion-viewport').boundingBox())!;
  const bounds = (await pane.boundingBox())!;
  expect(Math.abs(bounds.y - viewport.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds.height - viewport.height)).toBeLessThanOrEqual(1);
  expect(await date.boundingBox()).toEqual(dateBefore);
  await expect(page).toHaveURL(url => url.pathname === '/today');
  await expect(page.getByRole('button', { name: 'Complete day', exact: true })).toHaveCount(0);
  await expect(pane.getByText('Fixture breakfast', { exact: true })).toBeVisible();
  await expectNoBlockingAccessibilityViolations(page, testInfo, { kind: 'probe', surfaceId: 'expanded-food' });
  await page.screenshot({ path: testInfo.outputPath('food-expanded.png') });
  await pane.getByRole('button', { name: 'Add food', exact: true }).click();
  await expect(page.getByTestId('adaptive-dialog-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(pane).toBeVisible();
  await page.getByRole('button', { name: 'Collapse Food log' }).click();
  await expect(pane).toHaveCount(0);
  expect(await source.boundingBox()).toEqual(before);
  await expect(source).toBeFocused();
});

test('Progress expansions use the whole pane and return a scrolled overview', async ({ page, ux }, testInfo) => {
  if (testInfo.project.name === 'compact-phone-chrome') await page.setViewportSize({ width: 320, height: 568 });
  await ux.install('populated');
  await page.route('**/api/v1/calibration/status', route => route.fulfill({ json: PLAN_CHECK_RECOMMENDATION_STATUS }));
  await page.goto('/progress');
  await hideTransientPwaNotices(page);
  await expect(page.getByTestId('progress-snapshot-card')).toBeVisible();
  for (const [name, id, selector] of [
    ['Trend', 'trend', 'weight-trend-preview-card'],
    ['Plan check', 'plan', 'plan-check-summary']
  ]) {
    const source = page.getByTestId(selector);
    await source.scrollIntoViewIfNeeded();
    const before = await source.boundingBox();
    const scroll = await page.getByTestId('fixed-page-scroll').evaluate(el => el.scrollTop);
    await page.screenshot({ path: testInfo.outputPath(`${id}-overview.png`) });
    await source.click();
    const pane = page.getByTestId(`expanded-${id}`);
    await expect(page.getByRole('button', { name: `Collapse ${name}` })).toBeFocused();
    const viewport = (await page.getByTestId('page-expansion-viewport').boundingBox())!;
    const bounds = (await pane.boundingBox())!;
    expect(Math.abs(bounds.y - viewport.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.height - viewport.height)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('app-header-title')).toHaveText('Progress');
    if (id === 'trend') await expect(pane.getByTestId('selected-trend-summary')).toBeVisible();
    else await expect(pane.getByRole('button', { name: 'Review suggested 1,750 calorie daily target' })).toBeAttached();
    await page.screenshot({ path: testInfo.outputPath(`${id}-expanded.png`) });
    await expectNoBlockingAccessibilityViolations(page, testInfo, { kind: 'probe', surfaceId: `expanded-${id}` });
    await page.keyboard.press('Escape');
    await expect(pane).toHaveCount(0);
    expect(await source.boundingBox()).toEqual(before);
    expect(await page.getByTestId('fixed-page-scroll').evaluate(el => el.scrollTop)).toEqual(scroll);
    await expect(source).toBeFocused();
  }
});

test('real motion moves the pane and both siblings in both directions', async ({ page, ux }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'Measure animation frames once without touch emulation.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await ux.install('populated');
  await page.goto('/today');
  await hideTransientPwaNotices(page);
  const source = page.getByTestId('today-food-preview');
  await expect(source).toBeVisible();
  const sample = async (selector: string) => page.locator(selector).evaluate(button => new Promise<Array<{ top: number; height: number; above: number; below: number }>>(resolve => {
    const frames: Array<{ top: number; height: number; above: number; below: number }> = [];
    const start = performance.now();
    (button as HTMLElement).click();
    const capture = () => {
      const pane = document.querySelector('[data-testid="expanded-food"]')?.getBoundingClientRect();
      const above = document.querySelector('[data-testid="calorie-balance-hero"]')!.getBoundingClientRect().y;
      const below = document.querySelector('[data-testid="today-action-dock"]')!.getBoundingClientRect().y;
      if (pane) frames.push({ top: pane.y, height: pane.height, above, below });
      if (performance.now() - start < 650) requestAnimationFrame(capture);
      else resolve(frames);
    };
    requestAnimationFrame(capture);
  }));
  const opening = await sample('[data-testid="today-food-preview"]');
  for (const field of ['top', 'height', 'above', 'below'] as const) {
    expect(new Set(opening.map(frame => Math.round(frame[field]))).size).toBeGreaterThan(3);
  }
  expect(opening.at(-1)!.top).toBeLessThan(opening[0].top);
  expect(opening.at(-1)!.height).toBeGreaterThan(opening[0].height);
  expect(opening.at(-1)!.above).toBeLessThan(opening[0].above);
  expect(opening.at(-1)!.below).toBeGreaterThan(opening[0].below);
  const closing = await sample('[aria-label="Collapse Food log"]');
  expect(new Set(closing.map(frame => Math.round(frame.top))).size).toBeGreaterThan(3);
  expect(closing.at(-1)!.top).toBeGreaterThan(closing[0].top);
  await expect(page.getByTestId('expanded-food')).toHaveCount(0);
  await expect(source).toBeFocused();
  await testInfo.attach('expansion-animation-frames', { body: JSON.stringify({ opening, closing }), contentType: 'application/json' });
});

test('expanded pages reflow after resizing and keep enlarged-text actions reachable', async ({ page, ux }, testInfo) => {
  test.skip(testInfo.project.name !== 'compact-phone-chrome', 'One short-screen reflow cross-cut.');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await ux.install('populated', { foodDayStatus: 'OPEN' });
  await page.route('**/api/v1/calibration/status', route => route.fulfill({ json: PLAN_CHECK_RECOMMENDATION_STATUS }));
  for (const [route, sourceId, id, name] of [
    ['/today', 'today-food-preview', 'food', 'Food log'],
    ['/progress', 'weight-trend-preview-card', 'trend', 'Trend'],
    ['/progress', 'plan-check-summary', 'plan', 'Plan check']
  ]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    await hideTransientPwaNotices(page);
    const source = page.getByTestId(sourceId);
    await source.click();
    const pane = page.getByTestId(`expanded-${id}`);
    const collapse = page.getByRole('button', { name: `Collapse ${name}` });
    await expect(collapse).toBeFocused();
    if (id === 'trend') await expect(pane.getByTestId('selected-trend-summary')).toBeVisible();
    if (id === 'food') await expect(pane.getByText('Fixture breakfast', { exact: true })).toBeVisible();
    if (id === 'plan') await expect(pane.getByRole('button', { name: 'Review suggested 1,750 calorie daily target' })).toBeVisible();
    await applyTwoHundredPercentText(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await expect.poll(async () => {
      const [paneBox, viewportBox] = await Promise.all([pane.boundingBox(), page.getByTestId('page-expansion-viewport').boundingBox()]);
      return Math.abs(paneBox!.height - viewportBox!.height);
    }).toBeLessThanOrEqual(1);
    await expect(collapse).toBeInViewport({ ratio: 1 });
    const lastAction = id === 'food' ? pane.getByRole('button', { name: 'Add food', exact: true })
      : id === 'plan' ? pane.getByRole('button', { name: 'Review suggested 1,750 calorie daily target' })
        : pane.getByTestId('selected-trend-summary');
    await lastAction.scrollIntoViewIfNeeded();
    await expect(lastAction).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`${id}-expanded-large-text-dark.png`) });
    await collapse.click();
    await expect(pane).toHaveCount(0);
    await expect(source).toBeFocused();
    await source.click();
    await expect(collapse).toBeFocused();
    await collapse.click();
    await expect(pane).toHaveCount(0);
  }
});

test('expansion history coexists with tab navigation and repeated collapse', async ({ page, ux }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'One browser history cross-cut.');
  await ux.install('populated');
  await page.goto('/today');
  await hideTransientPwaNotices(page);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByTestId('today-food-preview').click();
    await expect(page.getByRole('button', { name: 'Collapse Food log' })).toBeFocused();
    await page.getByRole('button', { name: 'Collapse Food log' }).click();
    await expect(page.getByTestId('today-food-preview')).toBeFocused();
  }
  await page.getByTestId('today-food-preview').click();
  await expect(page.getByRole('button', { name: 'Collapse Food log' })).toBeFocused();
  await page.getByRole('tab', { name: 'Progress' }).click();
  await expect(page).toHaveURL(url => url.pathname === '/progress');
  await page.goBack();
  await expect(page).toHaveURL(url => url.pathname === '/today');
  await expect(page.getByTestId('expanded-food')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('expanded-food')).toHaveCount(0);
  await expect(page.getByTestId('today-food-preview')).toBeFocused();
});
