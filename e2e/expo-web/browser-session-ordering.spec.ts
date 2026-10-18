import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { test, expect } from '@playwright/test';

// Exercise real Set-Cookie processing with the production intent store and synthetic HTTP responses.
const storeCode = ts.transpileModule(fs.readFileSync(path.resolve('mobile/src/auth/logoutIntentStore.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

for (const order of ['old-first', 'replacement-first'] as const) {
  test(`cookie ownership remains with replacement (${order})`, async ({ page, context, baseURL }) => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const requests: string[] = [];
    await page.route('**/session-fixture/**', async route => {
      const action = new URL(route.request().url()).pathname.split('/').at(-1)!;
      if (action === 'page') return route.fulfill({ contentType: 'text/html', body: '<html><title>Cookie ordering fixture</title></html>' });
      requests.push(action);
      if (action === 'old') await held;
      await route.fulfill({ contentType: 'application/json', headers: {
        'Set-Cookie': action === 'logout' ? 'session_fixture=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax' : `session_fixture=${action}; Path=/; HttpOnly; SameSite=Lax`,
      }, body: '{}' });
    });
    await page.goto('/session-fixture/page');
    await page.evaluate(({ code, origin }) => {
      const exports: Record<string, any> = {};
      new Function('exports', code)(exports);
      const store = exports.createLogoutIntentStore({
        get: async (key: string) => localStorage.getItem(key),
        set: async (key: string, value: string) => localStorage.setItem(key, value),
        remove: async (key: string) => localStorage.removeItem(key),
      }, async () => { const result = await fetch('/session-fixture/logout', { method: 'POST', credentials: 'include' }); if (!result.ok) throw new Error('Revocation failed'); },
      true, (key: string, work: () => Promise<unknown>) => navigator.locks.request(key, work));
      const state = (window as any).sessionFixture = { store, origin, current: true, accepted: null };
      state.old = store.withBrowserSession(origin, async (intent: any) => {
        await intent.flushExplicitLogout(origin);
        await fetch('/session-fixture/old', { method: 'POST', credentials: 'include' });
        if (!state.current) { await intent.beginExplicitLogout(origin); await intent.flushExplicitLogout(origin); return; }
        await intent.finishExplicitLogin(origin); state.accepted = 'old';
      });
    }, { code: storeCode, origin: baseURL! });
    await expect.poll(() => requests).toContain('old');
    if (order === 'old-first') { release(); await page.evaluate(() => (window as any).sessionFixture.old); }
    await page.evaluate(() => {
      const state = (window as any).sessionFixture;
      state.current = false;
      state.replacement = state.store.withBrowserSession(state.origin, async (intent: any) => {
        await intent.flushExplicitLogout(state.origin);
        await fetch('/session-fixture/replacement', { method: 'POST', credentials: 'include' });
        await intent.finishExplicitLogin(state.origin); state.accepted = 'replacement';
      });
    });
    if (order === 'replacement-first') {
      expect(requests).toEqual(['old']);
      release();
    }
    await page.evaluate(async () => { const state = (window as any).sessionFixture; await Promise.all([state.old, state.replacement]); });
    expect((await context.cookies()).find(cookie => cookie.name === 'session_fixture')?.value).toBe('replacement');
    expect(await page.evaluate(() => (window as any).sessionFixture.accepted)).toBe('replacement');
    expect(requests).toEqual(order === 'old-first' ? ['old', 'replacement'] : ['old', 'logout', 'replacement']);
  });
}
