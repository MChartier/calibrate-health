import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA, type ManifestOptions, type VitePWAOptions } from 'vite-plugin-pwa'
import {
  QUICK_ADD_SHORTCUT_ACTIONS,
  QUICK_ADD_SHORTCUT_QUERY_PARAM,
  type QuickAddShortcutAction
} from './src/constants/pwaShortcuts'

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

const QUICK_ADD_SHORTCUT_ICON = 'pwa-192x192.png' // Icon used for quick-add PWA shortcuts.
const QUICK_ADD_SHORTCUT_BASE_PATH = '/log' // Base route for quick-add shortcuts.
// Reuse an existing app window so PWA shortcuts navigate instead of spawning a new instance.
const PWA_LAUNCH_HANDLER = {
  client_mode: 'navigate-existing',
} as const
// Placeholder PWA asset paths; replace with real files under frontend/public/.
const PWA_ICON_ASSETS: string[] = [
  'pwa/icons/app-maskable-192.png',
  'pwa/icons/app-maskable-512.png',
  'pwa/icons/app-monochrome-192.png',
  'pwa/icons/app-monochrome-512.png',
] 
// Screenshot placeholders used by install prompts/app stores (wide + narrow form factors).
const PWA_SCREENSHOT_ASSETS: string[] = [
  'pwa/screenshots/desktop-dashboard-1280x720.png',
  'pwa/screenshots/desktop-log-1280x720.png',
  'pwa/screenshots/mobile-dashboard-720x1280.png',
  'pwa/screenshots/mobile-log-720x1280.png',
]
const PWA_ICON_SPECS: ManifestOptions['icons'] = [
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
    src: 'pwa/icons/app-maskable-192.png',
    sizes: '192x192',
    type: 'image/png',
    purpose: 'maskable',
  },
  {
    src: 'pwa/icons/app-maskable-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
  {
    src: 'pwa/icons/app-monochrome-192.png',
    sizes: '192x192',
    type: 'image/png',
    purpose: 'monochrome',
  },
  {
    src: 'pwa/icons/app-monochrome-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'monochrome',
  },
]
const PWA_SCREENSHOT_SPECS: ManifestOptions['screenshots'] = [
  {
    src: 'pwa/screenshots/desktop-dashboard-1280x720.png',
    sizes: '1280x720',
    type: 'image/png',
    label: 'Dashboard overview',
    form_factor: 'wide',
  },
  {
    src: 'pwa/screenshots/desktop-log-1280x720.png',
    sizes: '1280x720',
    type: 'image/png',
    label: 'Food log and daily totals',
    form_factor: 'wide',
  },
  {
    src: 'pwa/screenshots/mobile-dashboard-720x1280.png',
    sizes: '720x1280',
    type: 'image/png',
    label: 'Mobile dashboard',
    form_factor: 'narrow',
  },
  {
    src: 'pwa/screenshots/mobile-log-720x1280.png',
    sizes: '720x1280',
    type: 'image/png',
    label: 'Mobile food log',
    form_factor: 'narrow',
  },
]

/**
 * Build a log-route URL that triggers a quick-add dialog when opened from a PWA shortcut.
 */
function buildQuickAddShortcutUrl(action: QuickAddShortcutAction): string {
  return `${QUICK_ADD_SHORTCUT_BASE_PATH}?${QUICK_ADD_SHORTCUT_QUERY_PARAM}=${action}`
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
      'icon.png',
      'apple-touch-icon.png',
      'pwa-192x192.png',
      'pwa-512x512.png',
      ...PWA_ICON_ASSETS,
      ...PWA_SCREENSHOT_ASSETS,
    ],
    manifest: {
      name: 'calibrate',
      short_name: 'calibrate',
      description: 'A responsive calorie tracker.',
      theme_color: '#111827',
      background_color: '#111827',
      categories: ['health', 'fitness', 'lifestyle'],
      display: 'standalone',
      display_override: ['window-controls-overlay', 'standalone', 'minimal-ui', 'browser'],
      launch_handler: PWA_LAUNCH_HANDLER,
      start_url: '/',
      scope: '/',
      icons: PWA_ICON_SPECS,
      screenshots: PWA_SCREENSHOT_SPECS,
      shortcuts: [
        {
          name: 'Log Weight',
          short_name: 'Log Weight',
          description: 'Record a weigh-in for today.',
          url: buildQuickAddShortcutUrl(QUICK_ADD_SHORTCUT_ACTIONS.weight),
          icons: [
            {
              src: QUICK_ADD_SHORTCUT_ICON,
              sizes: '192x192',
              type: 'image/png',
            },
          ],
        },
        {
          name: 'Log Food',
          short_name: 'Log Food',
          description: 'Add food to today.',
          url: buildQuickAddShortcutUrl(QUICK_ADD_SHORTCUT_ACTIONS.food),
          icons: [
            {
              src: QUICK_ADD_SHORTCUT_ICON,
              sizes: '192x192',
              type: 'image/png',
            },
          ],
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
const backendProxyTarget = 'http://localhost:3000' // Local backend origin for dev/preview proxies.
const backendProxy = {
  '/auth': backendProxyTarget,
  '/api': backendProxyTarget,
  '/dev/test': backendProxyTarget,
}

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
    proxy: backendProxy,
  },
  preview: {
    proxy: backendProxy,
  },
})
