import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.tsx'
import { ThemeModeProvider } from './context/ThemeModeContext.tsx'
import { registerSW } from 'virtual:pwa-register'

const queryClient = new QueryClient()

/**
 * Build the browser tab title, adding the dev worktree name when available.
 */
function getBrowserTitle() {
  const baseTitle = 'cal.io'
  if (!import.meta.env.DEV) return baseTitle
  const worktreeName = __WORKTREE_NAME__?.trim()
  if (!worktreeName) return baseTitle
  return `${worktreeName}.cal.io`
}

/**
 * Register the PWA service worker in production so the app is installable and can load offline.
 */
function registerServiceWorker() {
  if (!import.meta.env.PROD) return
  registerSW({ immediate: true })
}

document.title = getBrowserTitle()
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ThemeModeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
