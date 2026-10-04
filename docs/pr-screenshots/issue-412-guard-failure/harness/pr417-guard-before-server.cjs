const {pathToFileURL} = require('node:url');
const path = require('node:path');
(async () => {
  const moduleUrl = pathToFileURL(path.join(process.env.PR417_SOURCE_ROOT, 'scripts/expo-web-static-server.mjs')).href;
  const {createExpoWebStaticServer} = await import(moduleUrl);
  const server = createExpoWebStaticServer({distDir:process.env.PR417_EXPORT_ROOT});
  server.listen(44124, '127.0.0.1', () => console.log('Retained pre-fix export on 127.0.0.1:44124'));
  process.on('SIGINT', () => {server.closeAllConnections?.(); server.close(() => process.exit(0));});
})().catch(error => {console.error(error);process.exitCode=1;});
