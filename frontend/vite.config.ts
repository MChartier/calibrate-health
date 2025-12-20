import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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

const frontendDir = path.dirname(fileURLToPath(import.meta.url))
const repoRootName = path.basename(path.resolve(frontendDir, '..'))
const worktreeName = getWorktreeNameFromRepoRoot(repoRootName)

const usePolling =
  process.env.VITE_USE_POLLING === 'true' ||
  process.env.VITE_USE_POLLING === '1' ||
  isRunningInContainer()
const devServerPortEnv = process.env.VITE_DEV_SERVER_PORT
const devServerPortValue = devServerPortEnv ? Number.parseInt(devServerPortEnv, 10) : undefined
const devServerPort =
  devServerPortValue !== undefined && Number.isFinite(devServerPortValue) && devServerPortValue > 0
    ? devServerPortValue
    : undefined

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __WORKTREE_NAME__: JSON.stringify(worktreeName),
  },
  server: {
    host: true,
    port: devServerPort,
    strictPort: devServerPort !== undefined,
    watch: usePolling ? { usePolling: true, interval: 100 } : undefined,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
    }
  }
})
