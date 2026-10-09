import { createExpoWebStaticServer } from '../quantity-fix-448/scripts/expo-web-static-server.mjs';
import path from 'node:path';
const before=process.env.CAPTURE_PHASE?.includes('before');
const server=createExpoWebStaticServer({distDir:path.resolve(before?'../quantity448-base-dist':'../quantity-fix-448/mobile/dist')});
server.listen(18448,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections?.();server.close(()=>process.exit(0));});
