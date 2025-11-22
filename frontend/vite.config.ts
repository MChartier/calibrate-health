import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
    }
  }
})
