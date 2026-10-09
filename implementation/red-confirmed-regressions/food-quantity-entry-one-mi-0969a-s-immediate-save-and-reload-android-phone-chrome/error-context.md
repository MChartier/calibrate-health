# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: food-quantity-entry.spec.ts >> one-millionth amount edit survives immediate save and reload
- Location: ..\quantity-fix-448\e2e\expo-web\food-quantity-entry.spec.ts:45:7

# Error details

```
Error: expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 2

  Object {
-   "servings_consumed": 1.000004,
+   "meal_period": "BREAKFAST",
+   "name": "Quarter-cup oats",
  }
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - button "Skip to main content" [ref=e4] [cursor=pointer]
  - generic [ref=e7]:
    - generic [ref=e8]:
      - generic [ref=e11]:
        - banner [ref=e12]:
          - generic [ref=e13]:
            - button "Back to Today" [ref=e15] [cursor=pointer]:
              - generic [ref=e16]: 
            - heading "Food log" [level=1] [ref=e17]
            - toolbar "App actions" [ref=e18]:
              - button "Open notifications" [ref=e19] [cursor=pointer]:
                - generic [ref=e20]: 
              - button "Account & settings" [ref=e21] [cursor=pointer]:
                - generic [ref=e22]: 
        - generic [ref=e24]:
          - toolbar "Food log date" [ref=e28]:
            - button "Previous day" [ref=e29] [cursor=pointer]:
              - generic [ref=e30]: 
            - button "Choose date" [ref=e31] [cursor=pointer]:
              - generic [ref=e32]: Today
              - generic [ref=e33]: 
            - button "Next day" [disabled]:
              - generic [ref=e34]: 
          - main [ref=e41]:
            - generic [ref=e44]:
              - generic [ref=e45]:
                - heading "Meals" [level=2] [ref=e47]
                - button "Copy day" [ref=e48] [cursor=pointer]:
                  - generic [ref=e49]: 
                  - generic [ref=e50]: Copy day
              - generic [ref=e51]:
                - generic [ref=e53]:
                  - generic [ref=e54]:
                    - generic [ref=e56]: Breakfast
                    - generic [ref=e57]:
                      - generic [ref=e58]: 100 kcal
                      - button "Collapse Breakfast" [ref=e59] [cursor=pointer]:
                        - generic [ref=e60]: 
                  - generic [ref=e61]:
                    - generic [ref=e62]:
                      - generic [ref=e63]:
                        - generic [ref=e64]: Quarter-cup oats
                        - generic [ref=e65]: 0.25 cups
                      - generic [ref=e66]:
                        - generic [ref=e67]: 100 kcal
                        - button "Edit Quarter-cup oats" [active] [ref=e68] [cursor=pointer]:
                          - generic [ref=e69]: 
                        - button "Delete Quarter-cup oats" [ref=e70] [cursor=pointer]:
                          - generic [ref=e71]: 
                    - generic [ref=e72]:
                      - button "Copy Breakfast" [ref=e73] [cursor=pointer]:
                        - generic [ref=e74]: 
                        - generic [ref=e75]: Copy meal
                      - button "Save Breakfast as recipe" [ref=e76] [cursor=pointer]:
                        - generic [ref=e77]: 
                        - generic [ref=e78]: Save as recipe
                - generic [ref=e81]:
                  - generic [ref=e83]: Morning Snack
                  - generic [ref=e85]: No entries
                - generic [ref=e88]:
                  - generic [ref=e90]: Lunch
                  - generic [ref=e92]: No entries
                - generic [ref=e95]:
                  - generic [ref=e97]: Afternoon Snack
                  - generic [ref=e99]: No entries
                - generic [ref=e102]:
                  - generic [ref=e104]: Dinner
                  - generic [ref=e106]: No entries
                - generic [ref=e109]:
                  - generic [ref=e111]: Evening Snack
                  - generic [ref=e113]: No entries
      - tablist [ref=e115]:
        - tab "  Today" [selected] [ref=e117] [cursor=pointer]:
          - generic [ref=e118]:
            - generic [ref=e120]: 
            - generic [ref=e122]: 
          - generic [ref=e124]: Today
        - tab "  Progress" [ref=e127] [cursor=pointer]:
          - generic [ref=e128]:
            - generic [ref=e130]: 
            - generic [ref=e132]: 
          - generic [ref=e134]: Progress
    - button "Add food" [ref=e136] [cursor=pointer]:
      - generic [ref=e137]: 
      - generic [ref=e138]: Add food
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
  15 |   await ux.install('populated', { foodEntriesByDate: { '2026-07-21': [ENTRY] } });
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
  33 |   await expect(amount).toBeInViewport({ ratio: 1 });
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
  47 |     await ux.install('populated', { foodEntriesByDate: { '2026-07-21': [ENTRY] } });
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
> 59 |     expect((await request).postDataJSON()).toMatchObject({ servings_consumed: 1.000004 });
     |                                            ^ Error: expect(received).toMatchObject(expected)
  60 |     await expect(dialog).toBeHidden();
  61 |     await page.reload();
  62 |     await hideTransientPwaNotices(page);
  63 |     await page.getByRole('button', { name: `Edit ${FOOD.name}`, exact: true }).click();
  64 |     await expect(dialog.getByRole('textbox', { name: 'Amount', exact: true })).toHaveValue('0.250001');
  65 |   });
  66 | }
  67 | 
  68 | 
```