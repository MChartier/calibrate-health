const path = require('node:path');
module.exports = {
 testDir: __dirname, testMatch: 'matched.spec.ts', workers: 1, retries: 0, timeout: 45000,
 reporter: 'list', outputDir: path.join(__dirname, process.env.CAPTURE_LABEL + '-results'),
 use: { baseURL:'http://127.0.0.1:4174', viewport:{width:1280,height:1100}, deviceScaleFactor:1, colorScheme:'light', locale:'en-US', timezoneId:'America/Los_Angeles', reducedMotion:'reduce', serviceWorkers:'block' },
 webServer: { command:'node scripts/expo-web-static-server.mjs --port 4174', cwd:process.env.CAPTURE_ROOT, url:'http://127.0.0.1:4174', reuseExistingServer:false }
};
