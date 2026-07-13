import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
}

test('mobile dashboard and settings stay keyboard-operable without horizontal overflow', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);

  const dashboardTabs = page.getByRole('tablist', { name: 'Dashboard sections' });
  const logTab = dashboardTabs.getByRole('tab', { name: 'Log', exact: true });
  const goalsTab = dashboardTabs.getByRole('tab', { name: 'Goals', exact: true });

  await expect(logTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Log', exact: true })).toBeVisible();
  await logTab.focus();
  await logTab.press('ArrowRight');
  await expect(goalsTab).toBeFocused();
  await goalsTab.press('Enter');

  await expect(goalsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Goals', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Weight', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Goal projection', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
