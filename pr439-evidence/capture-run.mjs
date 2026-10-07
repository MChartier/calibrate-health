import path from 'node:path';
import { spawn } from 'node:child_process';
import { createExpoWebStaticServer } from '../../self-hosting-438/scripts/expo-web-static-server.mjs';
const variant = process.argv[2];
if (!['before','after'].includes(variant)) throw Error('expected before or after');
const root = path.resolve(variant === 'before' ? 'baseline-438' : 'self-hosting-438');
const server = createExpoWebStaticServer({ distDir: path.join(root, 'mobile/dist') });
await new Promise(resolve => server.listen(4179, '127.0.0.1', resolve));
try {
  const child = spawn(process.execPath, ['self-hosting-438/node_modules/@playwright/test/cli.js', 'test', '--config=assessment/ui-438/capture.config.ts'], { env:{...process.env,CAPTURE_VARIANT:variant}, stdio:'inherit' });
  const code = await new Promise(resolve => child.on('exit', resolve));
  if (code) process.exitCode = code;
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
