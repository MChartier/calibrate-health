import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { CssBaseline, ThemeProvider } from '@mui/material'
import theme from './theme.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.tsx'

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

document.title = getBrowserTitle()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
