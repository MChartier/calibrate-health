import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa'

function isRunningInContainer() {
  if (fs.existsSync('/.dockerenv')) return true
  try {
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8')
    return (
      cgroup.includes('docker') ||
      cgroup.includes('containerd') ||
      cgroup.includes('kubepods')
    )
  } catch {
    return false
  }
}

/**
 * Derive the worktree name from the repo root directory for dev-only labeling.
 */
function getWorktreeNameFromRepoRoot(repoRootName: string) {
  if (repoRootName === 'cal-io') return null
  if (repoRootName.startsWith('cal-io-')) {
    const suffix = repoRootName.slice('cal-io-'.length)
    return suffix.length > 0 ? suffix : null
  }
  return repoRootName.length > 0 ? repoRootName : null
}

/**
 * Configure PWA behavior (manifest + service worker) for installability on mobile/desktop.
 */
function getPwaOptions(): Partial<VitePWAOptions> {
  return {
    registerType: 'autoUpdate',
    // Ensure icons referenced by the manifest are copied through to the build output.
    includeAssets: [
      'icon.svg',
      'apple-touch-icon.png',
      'pwa-192x192.png',
      'pwa-512x512.png',
    ],
    manifest: {
      name: 'calibrate',
      short_name: 'calibrate',
      description: 'A responsive calorie tracker.',
      theme_color: '#111827',
      background_color: '#111827',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      icons: [
        {
          src: 'pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: 'pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        },
        {
          src: 'pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      // Workbox's default service worker bundling uses @rollup/plugin-terser in production mode.
      // In constrained/dev environments this can occasionally fail, and minification isn't critical here.
      mode: 'development',
      disableDevLogs: true,
      // SPA navigation fallback should not hijack backend endpoints.
      navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/dev\/test\//],
    },
  }
}

const frontendDir = path.dirname(fileURLToPath(import.meta.url))
const repoRootName = path.basename(path.resolve(frontendDir, '..'))
const worktreeName = getWorktreeNameFromRepoRoot(repoRootName)

const usePolling =
  process.env.VITE_USE_POLLING === 'true' ||
  process.env.VITE_USE_POLLING === '1' ||
  isRunningInContainer()
const devServerPortEnv = process.env.VITE_DEV_SERVER_PORT
const devServerPortValue = devServerPortEnv ? Number.parseInt(devServerPortEnv, 10) : Number.NaN
const devServerPort =
  typeof devServerPortValue === 'number' &&
  Number.isFinite(devServerPortValue) &&
  devServerPortValue > 0
    ? devServerPortValue
    : undefined

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA(getPwaOptions())],
  define: {
    __WORKTREE_NAME__: JSON.stringify(worktreeName),
  },
  server: {
    fs: {
      // Allow imports from the monorepo root (e.g. shared utilities used by both client and server).
      allow: [path.resolve(frontendDir, '..')],
    },
    host: true,
    port: devServerPort,
    strictPort: devServerPort !== undefined,
    watch: usePolling ? { usePolling: true, interval: 100 } : undefined,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/dev/test': 'http://localhost:3000',
    }
  }
})
