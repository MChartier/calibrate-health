# Frontend (calibrate)

React + TypeScript + Vite UI for calibrate. Uses MUI and React Query.

## Development

- Run from the repo root: `npm run dev` (recommended), or `npm --prefix frontend run dev` if the backend is already running.
- To opt into local service worker registration for PWA/push validation, run `npm run dev:pwa` from `frontend/`, or `npm run dev:pwa` from the repo root to run backend + frontend together.
- The Vite dev server expects the backend at `http://localhost:3000` and proxies `/auth`, `/api`, and `/dev/test`.
- Use `VITE_DEV_SERVER_PORT` to change the dev server port (the backend CORS default follows this port).
- If file watching is flaky in containers, set `VITE_USE_POLLING=1`.
- Standard dev mode (`npm run dev`) keeps service workers unregistered and clears stale localhost registrations/caches.

## Build

- `npm --prefix frontend run build` (or `npm run build` from the repo root).
- `npm --prefix frontend run preview` to smoke-test the production build locally.

## PWA

- Manifest and shortcuts are configured in `frontend/vite.config.ts`.
- Quick-add shortcuts route to `/log` with query params in `frontend/src/constants/pwaShortcuts.ts`.

## Localization

- UI strings live in `frontend/src/i18n/resources.ts`.
