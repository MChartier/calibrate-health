/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_SW_DEV?: string
}

declare const __WORKTREE_NAME__: string | null
