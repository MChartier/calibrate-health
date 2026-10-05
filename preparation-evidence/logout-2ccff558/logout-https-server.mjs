import https from 'node:https';
import fs from 'node:fs';
import { createExpoWebStaticServer } from './firebase-421/scripts/expo-web-static-server.mjs';
const source = createExpoWebStaticServer({ distDir: new URL('./firebase-421/mobile/dist', import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/, '$1') });
const server = https.createServer({ key: fs.readFileSync(new URL('./logout-local-key.pem', import.meta.url)), cert: fs.readFileSync(new URL('./logout-local-cert.pem', import.meta.url)) }, source.listeners('request')[0]);
server.listen(4175, '127.0.0.1', () => console.log('Synthetic HTTPS preview on https://127.0.0.1:4175'));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.closeAllConnections?.(); server.close(() => process.exit(0)); });
