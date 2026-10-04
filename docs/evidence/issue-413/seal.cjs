const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const bytes = file => file.endsWith('.png') ? fs.readFileSync(file) : Buffer.from(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'));
const digest = file => crypto.createHash('sha256').update(bytes(file)).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const sources = ['e2e/expo-web/fixtures.ts', 'e2e/expo-web/text-scaling.ts',
  'e2e/expo-web/ux-a11y.ts', 'e2e/expo-web/today-paused.spec.ts',
  'playwright.expo-web.config.ts', 'scripts/expo-web-static-server.mjs',
  'scripts/expo-web-build.mjs', 'scripts/expo-web-playwright.mjs',
  'package-lock.json', 'mobile/app/(tabs)/(today)/today.tsx',
  'mobile/src/components/TodayWeightCard.tsx', 'mobile/src/components/AppActionRow.tsx'];
const evidence = fs.readdirSync(__dirname).filter(name => name !== 'manifest.json').map(name => path.join(__dirname, name));
const files = [...evidence, ...sources.map(name => path.join(root, name))].sort();
const manifest = {
  schemaVersion: 1, issue: 413, host: 'MCHARTIER_ZBOOK', node: process.version,
  baselineSha: '29fb444ae4389ca81f3437d24685ed9badc43410',
  capturedAfterSha: '7bc5c17b62785e7ef8abe048f5069320edc9fdc5', parent: null,
  instructions: 'README.md; retained capture.config.ts and capture.spec.ts; each PNG JSON binds loaded scripts and image bytes',
  normalization: 'Shared synthetic frozen-clock fixture and transient PWA notice suppression; no image editing',
  textEncoding: 'UTF-8, LF (Git-normalized text; execution on Windows can use CRLF). PNG bytes are unchanged.',
  files: files.map(file => ({ path: relative(file), sha256: digest(file), bytes: bytes(file).length })),
};
fs.writeFileSync(path.join(__dirname, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('manifest.json SHA-256:', digest(path.join(__dirname, 'manifest.json')));
