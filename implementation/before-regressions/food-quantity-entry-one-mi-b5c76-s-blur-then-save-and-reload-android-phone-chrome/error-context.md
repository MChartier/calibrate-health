# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: food-quantity-entry.spec.ts >> one-millionth amount edit survives blur then save and reload
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

```
Error: Browser errors; route=/food-log viewport=390x844 project=android-phone-chrome last_failed_request=PATCH /api/v1/food/701 (404)

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "console.error: unexpected resource response (404)",
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - button [ref=e4] [cursor=pointer]: Skip to main content
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e11]:
          - banner [ref=e12]:
            - generic [ref=e13]:
              - button [ref=e15] [cursor=pointer]:
                - generic [ref=e16]: 
              - heading [level=1] [ref=e17]: Food log
              - toolbar [ref=e18]:
                - button [ref=e19] [cursor=pointer]:
                  - generic [ref=e20]: 
                - button [ref=e21] [cursor=pointer]:
                  - generic [ref=e22]: 
          - generic [ref=e24]:
            - toolbar [ref=e28]:
              - button [ref=e29] [cursor=pointer]:
                - generic [ref=e30]: 
              - button [ref=e31] [cursor=pointer]:
                - generic [ref=e32]: Today
                - generic [ref=e33]: 
              - button [disabled]:
                - generic [ref=e34]: 
            - main [ref=e41]:
              - generic [ref=e44]:
                - generic [ref=e45]:
                  - heading [level=2] [ref=e47]: Meals
                  - button [ref=e48] [cursor=pointer]:
                    - generic [ref=e49]: 
                    - generic [ref=e50]: Copy day
                - generic [ref=e51]:
                  - generic [ref=e53]:
                    - generic [ref=e54]:
                      - generic [ref=e56]: Breakfast
                      - generic [ref=e57]:
                        - generic [ref=e58]: 100 kcal
                        - button [ref=e59] [cursor=pointer]:
                          - generic [ref=e60]: 
                    - generic [ref=e61]:
                      - generic [ref=e62]:
                        - generic [ref=e63]:
                          - generic [ref=e64]: Quarter-cup oats
                          - generic [ref=e65]: 0.25 cups
                        - generic [ref=e66]:
                          - generic [ref=e67]: 100 kcal
                          - button [ref=e68] [cursor=pointer]:
                            - generic [ref=e69]: 
                          - button [ref=e70] [cursor=pointer]:
                            - generic [ref=e71]: 
                      - generic [ref=e72]:
                        - button [ref=e73] [cursor=pointer]:
                          - generic [ref=e74]: 
                          - generic [ref=e75]: Copy meal
                        - button [ref=e76] [cursor=pointer]:
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
          - tab [selected] [ref=e117] [cursor=pointer]:
            - generic [ref=e118]:
              - generic [ref=e120]: 
              - generic [ref=e122]: 
            - generic [ref=e124]: Today
          - tab [ref=e127] [cursor=pointer]:
            - generic [ref=e128]:
              - generic [ref=e130]: 
              - generic [ref=e132]: 
            - generic [ref=e134]: Progress
      - button [ref=e136] [cursor=pointer]:
        - generic [ref=e137]: 
        - generic [ref=e138]: Add food
  - dialog [ref=e140]:
    - dialog "Edit food" [ref=e145]:
      - generic [ref=e149]:
        - generic [ref=e150]:
          - heading "Edit food" [level=1] [ref=e151]
          - generic [ref=e152]: Update this log entry snapshot.
        - generic [ref=e153]:
          - generic [ref=e154]: Food name
          - textbox "Food name" [ref=e155]: Quarter-cup oats
        - generic [ref=e156]:
          - generic [ref=e157]:
            - generic [ref=e158]: Amount
            - generic [ref=e159]: cup
          - generic [ref=e160]:
            - button "Decrease Amount by 0.25" [disabled]:
              - generic [ref=e162]: 
            - textbox "Amount" [ref=e164]: "0.250001"
            - button "Increase Amount by 0.25" [ref=e165] [cursor=pointer]:
              - generic [ref=e167]: 
          - generic [ref=e168]: Use +/- 0.25 cup; type any positive decimal.
        - generic [ref=e169]:
          - generic [ref=e170]:
            - generic [ref=e171]: Calories
            - generic [ref=e172]: kcal
          - generic [ref=e173]:
            - button "Decrease Calories by 25" [ref=e174] [cursor=pointer]:
              - generic [ref=e176]: 
            - textbox "Calories" [ref=e178]: "100"
            - button "Increase Calories by 25" [ref=e179] [cursor=pointer]:
              - generic [ref=e181]: 
        - generic [ref=e182]: Meal
        - combobox "Select meal" [ref=e184] [cursor=pointer]:
          - generic [ref=e186]: Breakfast
          - generic [ref=e187]: 
        - alert [ref=e188]: Unable to update food entry.
        - generic [ref=e189]:
          - button "Cancel" [ref=e190] [cursor=pointer]:
            - generic [ref=e191]:
              - generic [ref=e192]: 
              - generic [ref=e193]: Cancel
          - button "Save" [ref=e194] [cursor=pointer]:
            - generic [ref=e195]:
              - generic [ref=e196]: 
              - generic [ref=e197]: Save
```

# Test source

```ts
  790 |     if (pathname === '/api/v1/metrics') return fulfillJson(route, metrics);
  791 |     if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
  792 |       diagnosticsByPage.get(page)?.unexpectedApiRequests.push(`${route.request().method()} ${pathname}`);
  793 |       return fulfillApiError(route, 501, 'SERVER_ERROR', 'Unhandled deterministic fixture request');
  794 |     }
  795 |     return route.continue();
  796 |   });
  797 | }
  798 | 
  799 | async function installState(
  800 |   page: Page,
  801 |   context: BrowserContext,
  802 |   state: UxFixtureState,
  803 |   options: AuthenticatedApiOptions,
  804 | ): Promise<UxStateController> {
  805 |   let resolveLoading = () => {};
  806 |   const loadingReleased = new Promise<void>((resolve) => {
  807 |     resolveLoading = resolve;
  808 |   });
  809 |   if (state === 'signed-out') {
  810 |     await installSignedOutApi(page);
  811 |   } else {
  812 |     await installAuthenticatedApi(page, state === 'offline' ? 'populated' : state, options, loadingReleased);
  813 |   }
  814 |   return {
  815 |     activateOffline: () => activateFixtureOffline(page),
  816 |     releaseLoading: resolveLoading,
  817 |   };
  818 | }
  819 | 
  820 | function attachFixtureDiagnostics(page: Page, diagnostics: FixtureDiagnostics): void {
  821 |   if (diagnosticsByPage.has(page)) return;
  822 |   diagnosticsByPage.set(page, diagnostics);
  823 |   page.on('pageerror', (error) => diagnostics.browserErrors.push(`pageerror: ${error.message}`));
  824 |   page.on('console', (message) => {
  825 |     if (message.type() !== 'error') return;
  826 |     if (
  827 |       diagnostics.intentionalOffline
  828 |       && message.text() === 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED'
  829 |     ) return;
  830 |     const resourceStatus = Number(RESOURCE_ERROR_STATUS_PATTERN.exec(message.text())?.[1]);
  831 |     if (Number.isInteger(resourceStatus)) {
  832 |       diagnostics.resourceErrors.set(resourceStatus, (diagnostics.resourceErrors.get(resourceStatus) ?? 0) + 1);
  833 |       return;
  834 |     }
  835 |     diagnostics.browserErrors.push(`console.error: ${message.text()}`);
  836 |   });
  837 |   page.on('requestfailed', (request) => {
  838 |     const pathname = new URL(request.url()).pathname;
  839 |     diagnostics.lastFailedRequest = `${request.method()} ${pathname} (${request.failure()?.errorText ?? 'failed'})`;
  840 |   });
  841 |   page.on('response', (response) => {
  842 |     if (response.status() < 400) return;
  843 |     const request = response.request();
  844 |     const pathname = new URL(request.url()).pathname;
  845 |     diagnostics.lastFailedRequest = `${request.method()} ${pathname} (${response.status()})`;
  846 |     const key = apiFailureKey({ method: request.method(), pathname, status: response.status() });
  847 |     if (diagnostics.expectedApiFailures.has(key)) {
  848 |       diagnostics.expectedResourceErrors.set(
  849 |         response.status(),
  850 |         (diagnostics.expectedResourceErrors.get(response.status()) ?? 0) + 1,
  851 |       );
  852 |     }
  853 |   });
  854 | }
  855 | export const test = base.extend<{ ux: UxHarness; diagnostics: void }>({
  856 |   diagnostics: [async ({ page }, use, testInfo) => {
  857 |     const diagnostics: FixtureDiagnostics = {
  858 |       browserErrors: [],
  859 |       unexpectedApiRequests: [],
  860 |       lastFailedRequest: null,
  861 |       expectedApiFailures: new Set(),
  862 |       expectedResourceErrors: new Map(),
  863 |       resourceErrors: new Map(),
  864 |     };
  865 |     attachFixtureDiagnostics(page, diagnostics);
  866 |     await freezeBrowserInputs(page);
  867 | 
  868 | 
  869 |     await use();
  870 | 
  871 |     for (const [status, count] of diagnostics.resourceErrors) {
  872 |       const unexpectedCount = Math.max(0, count - (diagnostics.expectedResourceErrors.get(status) ?? 0));
  873 |       for (let index = 0; index < unexpectedCount; index += 1) {
  874 |         diagnostics.browserErrors.push(`console.error: unexpected resource response (${status})`);
  875 |       }
  876 |     }
  877 | 
  878 |     const failureContext = formatFailureContext(page, testInfo, diagnostics);
  879 |     if (testInfo.status !== testInfo.expectedStatus) {
  880 |       await testInfo.attach('failure-context.json', {
  881 |         body: Buffer.from(JSON.stringify({
  882 |           context: failureContext,
  883 |           browserErrors: diagnostics.browserErrors,
  884 |           unexpectedApiRequests: diagnostics.unexpectedApiRequests,
  885 |         }, null, 2)),
  886 |         contentType: 'application/json',
  887 |       });
  888 |       console.error(`[expo-web failure] ${failureContext}`);
  889 |     }
> 890 |     expect.soft(diagnostics.browserErrors, `Browser errors; ${failureContext}`).toEqual([]);
      |                                                                                 ^ Error: Browser errors; route=/food-log viewport=390x844 project=android-phone-chrome last_failed_request=PATCH /api/v1/food/701 (404)
  891 |     expect.soft(diagnostics.unexpectedApiRequests, `Unhandled API requests; ${failureContext}`).toEqual([]);
  892 |   }, { auto: true }],
  893 |   ux: async ({ page, context }, use) => {
  894 |     let installed: { state: UxFixtureState; options: AuthenticatedApiOptions } | null = null;
  895 |     await use({
  896 |       install: async (state, options = {}) => {
  897 |         if (installed) throw new Error('Only one deterministic UX state may be installed per test.');
  898 |         installed = { state, options };
  899 |         return installState(page, context, state, options);
  900 |       },
  901 |       installOnPage: async (additionalPage) => {
  902 |         if (!installed) throw new Error('Install a deterministic UX state before adding a page.');
  903 |         const diagnostics = diagnosticsByPage.get(page);
  904 |         if (!diagnostics) throw new Error('Primary page diagnostics must be installed before adding a page.');
  905 |         attachFixtureDiagnostics(additionalPage, diagnostics);
  906 |         await freezeBrowserInputs(additionalPage);
  907 |         return installState(additionalPage, context, installed.state, installed.options);
  908 |       },
  909 |     });
  910 |   },
  911 | });
  912 | 
  913 | export { expect };
  914 | 
```