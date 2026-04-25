# Frontend (calibrate)

React + TypeScript + Vite UI for calibrate. Uses MUI and React Query.

## Development

- Supported Node.js versions: `20.19+` or `22.12+` (required by Vite 8).
- Run from the repo root: `npm run dev` (recommended), or `npm --prefix frontend run dev` if the backend is already running.
- `npm run dev` at the repo root enables the PWA service worker in development (`VITE_ENABLE_SW_DEV=1`) so push flows can be tested locally.
- If you run the frontend directly and still need push/PWA behavior, set `VITE_ENABLE_SW_DEV=1` for that process (for example: `VITE_ENABLE_SW_DEV=1 npm --prefix frontend run dev`).
- The Vite dev server expects the backend at `http://localhost:3000` and proxies `/auth`, `/api`, and `/dev/test`.
- Use `VITE_DEV_SERVER_PORT` to change the dev server port (the backend CORS default follows this port).
- If file watching is flaky in containers, set `VITE_USE_POLLING=1`.
- Run `npm run dev:storybook` from the repo root, or `npm run storybook` in this directory, to test custom React components in isolation. Local runs default to port 6006; devcontainer worktrees use the generated `STORYBOOK_PORT`.

## Build

- `npm --prefix frontend run build` (or `npm run build` from the repo root).
- `npm --prefix frontend run preview` to smoke-test the production build locally.
- `npm --prefix frontend run storybook:build` (or `npm run build:storybook` from the repo root) to build the static Storybook.

## Storybook

- Stories live next to components as `*.stories.tsx`.
- `.storybook/preview.tsx` applies the app theme, global CSS, English i18n, React Router, and React Query providers so component stories render in the same UI shell as the app.
- Use the Storybook toolbar to switch between light and dark palette modes.

## PWA

- Manifest and shortcuts are configured in `frontend/vite.config.ts`.
- Quick-add shortcuts route to `/log` with query params in `frontend/src/constants/pwaShortcuts.ts`.

## Localization

- UI strings live in `frontend/src/i18n/resources.ts`.
