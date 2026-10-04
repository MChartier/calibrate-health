const path = require('node:path');
const root = process.env.PR417_SOURCE_ROOT;
if (!root) throw new Error('PR417_SOURCE_ROOT is required');
module.exports = {
  testDir: __dirname,
  testMatch: path.join(__dirname, 'pr417-guard-capture.spec.ts').replaceAll('\\', '/'),
  outputDir: path.join(__dirname, 'pr417-guard-capture-results'),
  workers: 1, retries: 0, timeout: 60000, reporter: 'list',
  use: {
    baseURL: process.env.PR417_CAPTURE_URL,
    channel: 'chrome', viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1,
    locale: 'en-US', timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce', colorScheme: 'light',
  },
};
