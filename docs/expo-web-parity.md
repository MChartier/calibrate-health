# Expo Web Parity Plan

This document is the replacement contract for browser delivery from the
Expo Router/React Native Web client in `mobile/`. The production image now
serves Expo web for dogfooding. The Vite/MUI client in `frontend/` remains
buildable as a rollback surface until the remaining parity gates are met; do
not delete it while any row is partial or blocked.

## Status vocabulary

- **Ready**: the Expo route and its required browser behavior exist.
- **Partial**: the core workflow exists, but a Vite capability or browser gate is missing.
- **Missing**: no production-equivalent Expo web surface exists.
- **Native-only**: intentionally unavailable in browsers and guarded at the platform boundary.

## Route parity

| Vite route/capability | Expo route | Status | Work required before cutover |
| --- | --- | --- | --- |
| `/` public home | `app/index.web.tsx` | Ready | Keep public-route browser release coverage. |
| `/login` | `app/(auth)/login.tsx` | Ready | Cookie login and `/auth/me` restore are browser-specific and store no bearer credentials. |
| `/register` | `app/(auth)/register.tsx` | Ready | Registration establishes the backend cookie session. |
| `/privacy` | `app/privacy.tsx` | Ready | Keep it public and synchronized with the self-hosting disclosures. |
| `/account-deletion` | `app/account-deletion.tsx` | Ready | Keep the public instructions and authenticated flow discoverable. |
| `/onboarding` | `app/onboarding.tsx` | Ready | Add a full browser workflow test across desktop and phone release viewports. |
| `/dashboard` | `app/(tabs)/today.tsx`, `progress.tsx` | Ready | Responsive navigation, workspace width, and chart behavior are covered by release smoke tests. |
| `/log` | `app/(tabs)/log.tsx` | Ready | Legacy query entry points hand off to the Today add-food flow. |
| `/weight` | `app/(tabs)/weight.tsx` | Ready | Focused entry remains available across release viewports. |
| `/weight/history` | `app/(tabs)/progress.tsx` | Ready | Progress owns browser history, trend, and goal projection. |
| `/goals` | `app/(tabs)/goals.tsx` | Ready | Add browser E2E and desktop visual coverage. |
| `/settings` | `app/(tabs)/settings.tsx` | Partial | Core account/preferences controls are ready; browser-session inspection and password recovery remain operational follow-ups. |
| `/profile` | settings/profile content | Ready | `/settings` is the stable browser account/profile URL. |
| `/dev` | none | Missing | Preserve the provider/barcode dashboard as a separate internal web surface unless product scope explicitly removes it. |
| barcode capture | `app/barcode.tsx` | Partial | Test camera permissions and fallback copy in supported desktop/mobile browsers. |
| My Foods | `app/my-foods.tsx` | Ready | Add browser E2E and responsive verification. |
| notifications | `app/notifications.tsx` | Partial | In-app realtime state and browser push lifecycle are ready; end-to-end delivery must still pass the production HTTPS/VAPID gate. |
| activity / Health Connect | `app/activity.tsx`, `health-connect-privacy.tsx` | Native-only | Activity history may render on web, but Health Connect permission and sync controls must not mount. |

## Capability parity

| Capability | Current Expo web risk | Target boundary / release gate |
| --- | --- | --- |
| Authentication | Ready: browser cookie sessions are isolated in `AuthContext.web`; no bearer credentials enter browser storage. | Keep reload, expiry, logout, password-change, and account-deletion coverage. Offline cold start intentionally requires live session restore. |
| API transport | Ready: browser requests include credentials and same-origin is the deployment default. | Cross-origin production deployments still require exact CORS, HTTPS, and compatible cookie policy. |
| Server selection | Ready for same-origin and tested loopback development origins. | Treat cross-origin production selection as an advanced self-hosting mode with an explicit deployment check. |
| Offline mutation outbox | Ready: IndexedDB uses the shared ordered reconciler and stable operation IDs. | Retain reload/reconnect E2E and namespace-isolation tests; surface blocked storage honestly. |
| Health Connect | Ready boundary: web omits native APIs and retains read-only server activity. | Keep native-only controls out of the web bundle. |
| Wear transport | Ready boundary: pairing and transport stay native-only. | Web settings direct users to Android. |
| Push notifications | Ready client path: credentialed SSE, user-initiated permission/subscription, session cleanup, endpoint rotation repair, and safe service-worker delivery/click handling are implemented. | Validate real delivery, revocation, and action clicks over production HTTPS with VAPID configured. |
| Barcode | Camera may render through Expo web but is unverified. | Browser capability detection, permission-denied recovery, manual-entry fallback, and E2E coverage. |
| Localization | Mobile strings are hard-coded English. | Port EN/ES/FR/RU resources and language selection; every visible copy change remains synchronized. |
| Responsive shell | Ready across compact phone, phone, tablet, and desktop release viewports. | Keep keyboard, overflow, and route-navigation checks in the release suite. |
| PWA lifecycle | Ready: install metadata, explicit update activation/retry, offline/recovery UI, and backend cache bypass are implemented. | Validate two-version upgrade and installed-mode behavior on a production HTTPS host. |
| Static delivery | Ready: the production image builds the validated Expo export, serves prerendered routes, preserves backend boundaries, and applies PWA-safe cache headers. | Keep the container smoke test and tagged AMD64 build green. |

## Platform boundary

Platform decisions belong behind stable feature contracts rather than scattered
`Platform.OS` checks in screens:

```text
mobile/src/platform/
  runtime.native.tsx  -> native push, Health Connect, Wear routing/invalidation
  runtime.web.tsx     -> browser-safe providers only
mobile/src/auth/
  session.native.ts   -> SecureStore access/refresh tokens and device identity
  session.web.ts      -> HttpOnly cookie session; no token reads or writes
mobile/src/offline/
  database.native.ts  -> Expo SQLite
  database.web.ts     -> IndexedDB adapter with the same outbox contract
```

The root layout may compose these contracts, but feature screens must not import
native modules directly on web. Platform files should export matching types so
TypeScript verifies both implementations. Native-only routes and settings must
render intentional web copy or be omitted; they must never fail during module
evaluation.

## Delivery sequence

1. Introduce the platform runtime and auth-session contracts with native behavior unchanged.
2. Implement cookie login/register/restore/logout for Expo web and browser tests.
3. Implement and stress-test the IndexedDB outbox adapter, including reload and replay ordering.
4. Build the responsive desktop shell/workspaces and chart behavior.
5. Port localization, public pages, web push, and the PWA lifecycle.
6. Add Expo static export/deploy alongside Vite and run browser parity E2E. **Complete.**
7. Dogfood authenticated Expo routes while retaining Vite as a rollback build. **In progress.**
8. Retire Vite only after public routes and all production release gates pass.

## Replacement gates

- Cookie auth survives reload, expiry, logout, and account deletion without tokens in Web Storage or IndexedDB.
- Offline mutations survive reload and replay exactly once in server/user order.
- Native-only modules are absent from the web bundle and every corresponding route has intentional browser UX.
- EN/ES/FR/RU, keyboard navigation, screen-reader labels, responsive layouts, and supported-browser E2E pass.
- Public privacy/account-deletion pages, PWA install/update/offline behavior, and self-hosted static deployment pass.
- Vite remains deployable as the rollback target for at least one release after authenticated-route cutover.
