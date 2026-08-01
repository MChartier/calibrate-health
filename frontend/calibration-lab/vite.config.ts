import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    root,
    plugins: [react()],
    server: { fs: { allow: [path.resolve(root, '../..')] } },
    build: {
        outDir: path.resolve(root, '../dist/calibration-lab'),
        emptyOutDir: true
    }
});
