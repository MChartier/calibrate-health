import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: 'capture.spec.ts', workers: 1,
  reporter: 'list', outputDir: '../capture-output',
  use: {
    browserName: 'chromium', channel: 'chrome', locale: 'en-US',
    timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce', deviceScaleFactor: 1,
  },
});
