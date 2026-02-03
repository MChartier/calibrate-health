import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.tsx'
import { ThemeModeProvider } from './context/ThemeModeContext.tsx'
import { registerSW } from 'virtual:pwa-register'
import { I18nFromAuth } from './i18n/I18nFromAuth.tsx'

const queryClient = new QueryClient()

/**
 * Build the browser tab title, adding the dev worktree name when available.
 */
function getBrowserTitle() {
  const baseTitle = 'calibrate'
  if (!import.meta.env.DEV) return baseTitle
  const worktreeName = __WORKTREE_NAME__?.trim()
  if (!worktreeName) return baseTitle
  return `${worktreeName}.calibrate`
}

/**
 * Parse environment-style boolean flags where enabled values are "true" or "1".
 */
function isEnabledEnvFlag(rawValue: string | undefined): boolean {
  return rawValue === 'true' || rawValue === '1'
}

/**
 * Allow opt-in service worker registration during local development for PWA/push validation.
 */
function isServiceWorkerDevModeEnabled(): boolean {
  return isEnabledEnvFlag(import.meta.env.VITE_ENABLE_SW_DEV)
}

/**
 * Decide whether this runtime should register a service worker.
 */
function shouldRegisterServiceWorker(): boolean {
  if (import.meta.env.PROD) return true
  return import.meta.env.DEV && isServiceWorkerDevModeEnabled()
}

/**
 * Register the PWA service worker so production stays installable and opt-in dev can validate push.
 */
function registerServiceWorker() {
  registerSW({ immediate: true })
}

/**
 * In dev, aggressively unregister any service workers on this origin.
 *
 * It's easy to end up with a stale PWA service worker controlling localhost, which can make UI
 * updates appear "stuck" even while Vite HMR is running.
 */
async function unregisterServiceWorkersInDev() {
  if (!import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    const didUnregister =
      registrations.length > 0
        ? (await Promise.all(registrations.map((registration) => registration.unregister()))).some(
            Boolean,
          )
        : false

    if ('caches' in window) {
      const cacheKeys = await caches.keys()
      await Promise.all(cacheKeys.map((key) => caches.delete(key)))
    }

    // If we successfully unregistered something, reload once to ensure the page is no longer controlled.
    if (didUnregister) {
      window.location.reload()
    }
  } catch {
    // Best-effort cleanup only; dev should continue working even if unregister fails.
  }
}

/**
 * Configure service worker behavior for this boot with mutually exclusive register vs cleanup paths.
 */
async function configureServiceWorkerMode() {
  if (shouldRegisterServiceWorker()) {
    registerServiceWorker()
    return
  }

  await unregisterServiceWorkersInDev()
}

document.title = getBrowserTitle()
void configureServiceWorkerMode()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <AuthProvider>
          <I18nFromAuth>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </I18nFromAuth>
        </AuthProvider>
      </ThemeModeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
