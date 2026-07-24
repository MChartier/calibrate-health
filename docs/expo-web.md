# Expo web client

The browser client is the Expo Router/React Native Web application under `mobile/`. The same source tree also produces
the Android client; platform-specific behavior belongs behind `.web` and `.native` modules or the contracts under
`mobile/src/platform/`.

## Source boundaries

- Browser and shared routes: `mobile/app/`
- Shared client components and domain presentation: `mobile/src/`
- Browser cookie-session auth: `mobile/src/auth/AuthContext.web.tsx`
- Browser offline outbox: `mobile/src/offline/indexedDbOutbox.web.ts`
- PWA runtime and service-worker contract: `mobile/src/pwa/` and `mobile/public/`
- Production static export: `mobile/dist/`

Native-only features such as Health Connect and Wear transport must not evaluate native modules in the browser bundle.
Browser routes should either use the web implementation or render intentional guidance.

## Development and validation

- `npm run dev`: start the worktree-scoped backend, Expo web, and Postgres Compose services.
- `npm run dev:status`: print the current worktree's service state and URLs.
- `npm run preview`: build and preview Expo web with the backend.
- `npm run build`: create the production Expo web export.
- `npm run test:expo-web:release`: validate static routes, PWA files, service-worker behavior, and hashed bundles.
- `npm run test:web:e2e`: build the release export and run the browser suite in installed Chrome.
- `npm run test:container:web`: smoke-test the production container's web delivery.

## Deployment

`Dockerfile.app` builds the Expo export and copies `mobile/dist` to `/app/web/dist`. The backend serves that directory
from `FRONTEND_DIST_DIR` while preserving `/api` and `/auth` boundaries. The standard deployment is same-origin so
browser cookie sessions work without CORS configuration. Split-origin deployments must use exact HTTPS origins and a
compatible secure-cookie policy.
