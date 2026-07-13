import { expect, test, type Page } from '@playwright/test';

const TEST_FOOD_NAME = 'E2E oatmeal';

async function chooseOption(page: Page, label: string, optionName: string): Promise<void> {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  // Rich options include explanatory copy in their accessible names, so match the leading label.
  await page.getByRole('option', { name: new RegExp(`^${optionName}\\b`) }).click();
}

/** Reset the shared dev account, then complete the same guided setup a new user sees. */
async function completeOnboarding(page: Page): Promise<void> {
  const resetResponse = await page.request.post('/dev/test/reset-test-user-onboarding');
  expect(resetResponse.ok()).toBe(true);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'Set up your target before you start logging.' })).toBeVisible();

  await page.getByRole('button', { name: "Let's get started", exact: true }).click();

  await page.getByRole('button', { name: 'Kilograms', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Current weight', exact: true }).fill('82');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByRole('spinbutton', { name: 'Target weight', exact: true }).fill('76');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByRole('combobox', { name: 'Pace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next: Calorie burn', exact: true }).click();

  await page.getByLabel('Date of Birth').fill('1990-01-15');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await chooseOption(page, 'Sex', 'Male');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await chooseOption(page, 'Activity Level', 'Moderate');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByRole('button', { name: 'Centimeters', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Height', exact: true }).fill('175');
  await page.getByRole('button', { name: 'Next: Import', exact: true }).click();

  await page.getByRole('button', { name: 'See my plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start logging', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start logging', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('new user can onboard, log food, and update today\'s weight', async ({ page }) => {
  await completeOnboarding(page);

  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Today's food log", exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Weight', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Add food', exact: true }).click();
  const foodDialog = page.getByRole('dialog', { name: 'Track Food' });
  await expect(foodDialog).toBeVisible();
  await foodDialog.getByRole('textbox', { name: 'Search foods', exact: true }).fill(TEST_FOOD_NAME);
  await foodDialog.getByRole('spinbutton', { name: 'Calories', exact: true }).fill('320');
  await chooseOption(page, 'Meal Period', 'Breakfast');
  await foodDialog.getByRole('button', { name: 'Add & close', exact: true }).click();

  await expect(foodDialog).toBeHidden();
  await expect(
    page.getByRole('group', { name: `${TEST_FOOD_NAME}, 320 Calories`, exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Edit weight', exact: true }).click();
  const weightDialog = page.getByRole('dialog', { name: /Track Weight/ });
  await expect(weightDialog).toBeVisible();
  await weightDialog.getByRole('spinbutton', { name: 'Weight (kg)', exact: true }).fill('81.5');
  await weightDialog.getByRole('button', { name: 'Save Weight', exact: true }).click();

  await expect(weightDialog).toBeHidden();
  await expect(page.getByRole('heading', { name: '81.5 kg', exact: true })).toBeVisible();
});
