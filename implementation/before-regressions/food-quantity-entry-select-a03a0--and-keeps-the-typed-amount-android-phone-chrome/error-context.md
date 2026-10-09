# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: food-quantity-entry.spec.ts >> selected food stays reachable in a short sheet and keeps the typed amount
- Location: ..\quantity-fix-448\e2e\expo-web\food-quantity-entry.spec.ts:13:5

# Error details

```
Error: expect(locator).toBeInViewport() failed

Locator:  getByRole('dialog', { name: 'Add food', exact: true }).getByRole('textbox', { name: 'Amount', exact: true })
Expected: in viewport
Received: viewport ratio 0
Timeout:  10000ms

Call log:
  - Expect "toBeInViewport" with timeout 10000ms
  - waiting for getByRole('dialog', { name: 'Add food', exact: true }).getByRole('textbox', { name: 'Amount', exact: true })
    23 × locator resolved to <input rows="1" dir="auto" value="0.125" autocorrect="on" autocomplete="on" spellcheck="true" enterkeyhint="done" inputmode="decimal" aria-label="Amount" aria-invalid="false" aria-required="false" autocapitalize="sentences" virtualkeyboardpolicy="auto" id="form-field-_r_b_-control" class="css-11aywtz r-6taxm2 r-9j3s6g r-1r2rb8h r-1q9bdsx r-rs99b7 r-1qar9k r-187pbxx r-ubezar r-majxgm r-oxtfae r-135wba7 r-1pl7oy7 r-11f147o r-3o4zer r-q4m81j"/>
       - unexpected value "viewport ratio 0"

```

```yaml
- textbox "Amount": "0.125"
```

# Test source

```ts
  1  | import { expect, hideTransientPwaNotices, test } from './fixtures';
  2  | 
  3  | const FOOD = {
  4  |   id: 901, type: 'FOOD', name: 'Quarter-cup oats', serving_size_quantity: 0.25,
  5  |   serving_unit_label: 'cup', calories_per_serving: 100, is_pinned: false,
  6  | };
  7  | const ENTRY = {
  8  |   id: 701, name: FOOD.name, meal_period: 'BREAKFAST' as const, calories: 100,
  9  |   servings_consumed: 1, serving_size_quantity_snapshot: 0.25,
  10 |   serving_unit_label_snapshot: 'cup', calories_per_serving_snapshot: 100,
  11 | };
  12 | 
  13 | test('selected food stays reachable in a short sheet and keeps the typed amount', async ({ page, ux }, testInfo) => {
  14 |   test.skip(testInfo.project.name !== 'android-phone-chrome', 'One touch browser viewport exercises the constrained sheet.');
  15 |   await ux.install('populated', { foodEntries: [ENTRY] });
  16 |   await page.route('**/api/v1/my-foods*', route => route.fulfill({ json:
  17 |     new URL(route.request().url()).pathname.endsWith('/library')
  18 |       ? { items: [FOOD], next_cursor: null } : [FOOD],
  19 |   }));
  20 |   await page.route('**/api/v1/food/search?*', route => route.fulfill({ json: { items: [], provider: 'usda' } }));
  21 |   await page.goto('/food-log');
  22 |   await hideTransientPwaNotices(page);
  23 |   await page.getByRole('button', { name: 'Add food', exact: true }).click();
  24 |   const dialog = page.getByRole('dialog', { name: 'Add food', exact: true });
  25 |   await dialog.getByRole('radio', { name: 'Search', exact: true }).click();
  26 |   await dialog.getByLabel('Search foods').fill(FOOD.name);
  27 |   await dialog.getByText(FOOD.name, { exact: true }).click();
  28 |   const amount = dialog.getByRole('textbox', { name: 'Amount', exact: true });
  29 |   await amount.fill('0.125');
  30 |   await page.setViewportSize({ width: 390, height: 420 });
  31 |   await amount.focus();
  32 |   await amount.scrollIntoViewIfNeeded();
> 33 |   await expect(amount).toBeInViewport({ ratio: 1 });
     |                        ^ Error: expect(locator).toBeInViewport() failed
  34 |   const submit = dialog.getByRole('button', { name: 'Add & close', exact: true });
  35 |   await submit.scrollIntoViewIfNeeded();
  36 |   await expect(submit).toBeInViewport({ ratio: 1 });
  37 |   const request = page.waitForRequest(request => request.method() === 'POST'
  38 |     && new URL(request.url()).pathname === '/api/v1/food');
  39 |   await submit.click();
  40 |   expect((await request).postDataJSON()).toMatchObject({ my_food_id: FOOD.id, servings_consumed: 0.125 });
  41 |   await expect(dialog).toBeHidden();
  42 | });
  43 | 
  44 | for (const blurBeforeSave of [false, true]) {
  45 |   test(`one-millionth amount edit survives ${blurBeforeSave ? 'blur then' : 'immediate'} save and reload`, async ({ page, ux }, testInfo) => {
  46 |     test.skip(testInfo.project.name !== 'android-phone-chrome', 'One touch browser covers input and mutation ordering.');
  47 |     await ux.install('populated', { foodEntries: [ENTRY] });
  48 |     await page.goto('/food-log');
  49 |     await hideTransientPwaNotices(page);
  50 |     await page.getByRole('button', { name: `Edit ${FOOD.name}`, exact: true }).click();
  51 |     const dialog = page.getByRole('dialog', { name: 'Edit food', exact: true });
  52 |     const amount = dialog.getByRole('textbox', { name: 'Amount', exact: true });
  53 |     await expect(amount).toHaveValue('0.25');
  54 |     await amount.fill('0.250001');
  55 |     if (blurBeforeSave) await amount.press('Tab');
  56 |     const request = page.waitForRequest(request => request.method() === 'PATCH'
  57 |       && new URL(request.url()).pathname === '/api/v1/food/701');
  58 |     await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  59 |     expect((await request).postDataJSON()).toMatchObject({ servings_consumed: 1.000004 });
  60 |     await expect(dialog).toBeHidden();
  61 |     await page.reload();
  62 |     await hideTransientPwaNotices(page);
  63 |     await page.getByRole('button', { name: `Edit ${FOOD.name}`, exact: true }).click();
  64 |     await expect(dialog.getByRole('textbox', { name: 'Amount', exact: true })).toHaveValue('0.250001');
  65 |   });
  66 | }
  67 | 
```