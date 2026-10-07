import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { expect, hideTransientPwaNotices, test } from './fixtures';

test('administrator changes persist and gate scanner entry points', async ({ page, ux }, testInfo) => {
    await ux.install('populated');
    let enabled = false;
    await page.route('**/api/v1/server-settings/users?*', (route) => route.fulfill({ json: { users: [], next_cursor: null } }));
    await page.route('**/api/v1/server-settings', async (route) => {
        if (route.request().method() === 'PATCH') {
            enabled = route.request().postDataJSON().features.nutrition_label_scanning;
        }
        await route.fulfill({ json: { is_admin: true, features: { nutrition_label_scanning: enabled } } });
    });
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Server administration', exact: true }).click();
    const toggle = page.getByRole('switch', { name: 'Nutrition label scanning', exact: true });
    await expect(toggle).not.toBeChecked();
    await hideTransientPwaNotices(page);
    const directory = path.resolve('.codex-screenshots/server-admin');
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, `${testInfo.project.name}-disabled.png`), fullPage: true });
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(page.getByText('Server settings saved.', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(directory, `${testInfo.project.name}-enabled.png`), fullPage: true });
    await page.goto('/my-foods');
    await expect(page.getByRole('button', { name: 'Scan label', exact: true })).toBeVisible();
    await page.goto('/server-admin');
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await page.goto('/my-foods');
    await expect(page.getByRole('button', { name: 'Create food', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan label', exact: true })).toHaveCount(0);
    await page.goto('/nutrition-label');
    await expect(page.getByText(/scanning is unavailable on this server/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose photo', exact: true })).toHaveCount(0);
});

test('members cannot access administrator controls through navigation or a direct URL', async ({ page, ux }) => {
    await ux.install('populated');
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Server administration', exact: true })).toHaveCount(0);
    await page.goto('/server-admin');
    await expect(page.getByText(/administrator access is required/)).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);
});


test('administrators confirm role changes and can cancel without saving', async ({ page, ux }) => {
    await ux.install('populated');
    const member = { id: 18, email: 'member@example.invalid', role: 'member', email_verified: true, created_at: '2026-01-01T00:00:00.000Z' };
    let saves = 0;
    await page.route('**/api/v1/server-settings', (route) => route.fulfill({ json: { is_admin: true, features: { nutrition_label_scanning: false } } }));
    await page.route('**/api/v1/server-settings/users?*', (route) => route.fulfill({ json: { users: [member], next_cursor: null } }));
    await page.route('**/api/v1/server-settings/users/18/role', async (route) => {
        saves += 1;
        expect(route.request().method()).toBe('PATCH');
        expect(route.request().postDataJSON()).toEqual({ role: 'admin' });
        member.role = 'admin';
        await route.fulfill({ json: { user: member } });
    });
    await page.goto('/server-admin');
    const promote = page.getByRole('button', { name: 'Make administrator: member@example.invalid', exact: true });
    await promote.click();
    const dialog = page.getByRole('dialog', { name: 'Make this member an administrator?', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(saves).toBe(0);
    await promote.click();
    await dialog.getByRole('button', { name: 'Confirm administrator access', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Make member: member@example.invalid', exact: true })).toBeVisible();
    expect(saves).toBe(1);
});

test('service settings explain browser origin boundaries and return to Settings', async ({ page, ux }) => {
    await ux.install('populated');
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Service & hosting', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/service');
    await expect(page.getByText(/This browser stays connected to the website/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Server URL' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open server administration' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/settings');
});
