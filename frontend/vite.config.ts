import fs from 'node:fs'
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

const usePolling =
  process.env.VITE_USE_POLLING === 'true' ||
  process.env.VITE_USE_POLLING === '1' ||
  isRunningInContainer()
const devServerPortEnv = process.env.VITE_DEV_SERVER_PORT
const devServerPortValue = devServerPortEnv ? Number.parseInt(devServerPortEnv, 10) : undefined
const devServerPort =
  Number.isFinite(devServerPortValue) && devServerPortValue > 0 ? devServerPortValue : undefined

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
