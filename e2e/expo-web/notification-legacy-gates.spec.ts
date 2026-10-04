import { expect, test } from './fixtures';

test('legacy notifications preserves sign-in gating on direct entry and reload', async ({ page, ux }) => {
  await ux.install('signed-out');
  await page.goto('/notifications?cursor=stale#history');
  await expect(page).toHaveURL((url) => url.pathname === '/login');
  await page.reload();
  await expect(page).toHaveURL((url) => url.pathname === '/login');
  await expect(page.getByTestId('notifications-button')).toHaveCount(0);
});

for (const [state, destination] of [
  ['email_verification_required', '/verify-email'],
  ['legal_acceptance_required', '/legal-update'],
] as const) {
  test(`legacy notifications preserves the ${state} account gate`, async ({ page, ux }) => {
    await ux.install('populated');
    await page.route('**/auth/me', (route) => route.fulfill({
      json: { user: {
        id: 17, email: 'release@example.invalid', timezone: 'America/Los_Angeles', language: 'en',
        weight_unit: 'KG', height_unit: 'CM', created_at: '2026-01-01T12:00:00.000Z',
        account_access: { state, email_verified: state !== 'email_verification_required', legal_current: false },
      } },
    }));
    await page.goto('/notifications?cursor=stale#history');
    await expect(page).toHaveURL((url) => url.pathname === destination);
    await page.reload();
    await expect(page).toHaveURL((url) => url.pathname === destination);
    await expect(page.getByTestId('notifications-button')).toHaveCount(0);
  });
}

test('legacy notifications preserves incomplete-profile onboarding', async ({ page, ux }) => {
  await ux.install('populated', { apiResources: [{
    pathname: '/api/v1/user/profile', state: 'content', empty: null,
    content: {
      profile: { timezone: 'America/Los_Angeles', date_of_birth: null, sex: null, height_mm: null, activity_level: null },
      latest_weight_grams: null, goal_daily_deficit: null,
      calorieSummary: { missing: ['profile'], eligibility: { status: 'ineligible' }, planStatus: 'unavailable' },
    },
  }] });
  await page.goto('/notifications');
  await expect(page).toHaveURL((url) => url.pathname === '/onboarding');
  await expect(page.getByTestId('notification-history')).toHaveCount(0);
});
