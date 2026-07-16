# Expo Web Parity Plan

This document is the replacement contract for moving browser delivery from the
Vite/MUI client in `frontend/` to the Expo Router/React Native Web client in
`mobile/`. The clients must run side by side until every release gate below is
met. Do not remove or redirect the Vite client while any row is partial or
blocked.

## Status vocabulary

- **Ready**: the Expo route and its required browser behavior exist.
- **Partial**: the core workflow exists, but a Vite capability or browser gate is missing.
- **Missing**: no production-equivalent Expo web surface exists.
- **Native-only**: intentionally unavailable in browsers and guarded at the platform boundary.

## Route parity

| Vite route/capability | Expo route | Status | Work required before cutover |
| --- | --- | --- | --- |
| `/` public home | `app/index.tsx` | Missing | Preserve a public landing page; authenticated users may redirect to Today. |
| `/login` | `app/(auth)/login.tsx` | Partial | Use the backend cookie session on web and restore it through `/auth/me`. |
| `/register` | `app/(auth)/register.tsx` | Partial | Register through the cookie-session endpoint; do not persist bearer or refresh tokens in browser storage. |
| `/privacy` | none | Missing | Port the public privacy surface and keep it available without authentication. |
| `/account-deletion` | none | Missing | Port the public deletion instructions and keep the authenticated deletion flow discoverable. |
| `/onboarding` | `app/onboarding.tsx` | Ready | Add browser E2E coverage and desktop-width visual verification. |
| `/dashboard` | `app/(tabs)/today.tsx`, `progress.tsx` | Partial | Add the desktop combined workspace and responsive chart behavior. |
| `/log` | `app/(tabs)/log.tsx` | Partial | Preserve mobile flow; combine with Today at the desktop breakpoint. |
| `/weight` | `app/(tabs)/weight.tsx` | Partial | Preserve focused mobile entry and add desktop workspace integration. |
| `/weight/history` | `app/(tabs)/progress.tsx` | Partial | Verify equivalent range controls, trends, and browser chart accessibility. |
| `/goals` | `app/(tabs)/goals.tsx` | Ready | Add browser E2E and desktop visual coverage. |
| `/settings` | `app/(tabs)/settings.tsx` | Partial | Hide native-only controls on web and port all account/session/preferences controls. |
| `/profile` | settings/profile content | Partial | Choose and document a stable web URL; preserve deep links and browser history. |
| `/dev` | none | Missing | Preserve the provider/barcode dashboard as a separate internal web surface unless product scope explicitly removes it. |
| barcode capture | `app/barcode.tsx` | Partial | Test camera permissions and fallback copy in supported desktop/mobile browsers. |
| My Foods | `app/my-foods.tsx` | Partial | Add browser E2E and responsive verification. |
| notifications | `app/notifications.tsx` | Partial | Separate in-app settings from native push and future web-push controls. |
| activity / Health Connect | `app/activity.tsx`, `health-connect-privacy.tsx` | Native-only | Activity history may render on web, but Health Connect permission and sync controls must not mount. |

## Capability parity

| Capability | Current Expo web risk | Target boundary / release gate |
| --- | --- | --- |
| Authentication | `SecureStore` and mobile refresh-token hydration are imported unconditionally. | `auth/session.native` owns mobile tokens; `auth/session.web` owns cookie login, `/auth/me` restore, and cookie logout. No browser bearer-token persistence. |
| API transport | Shared client assumes the browser default credential policy. | Explicitly test same-origin cookies. If cross-origin self-hosting remains supported, opt into `credentials: 'include'` and restrict CORS to configured origins. |
| Server selection | Mobile permits arbitrary server URLs and stores them in AsyncStorage. | Define the web deployment contract: same-origin by default; any cross-origin server switch must pass HTTPS/CORS/cookie tests. |
| Offline mutation outbox | `expo-sqlite` is imported unconditionally. | `offline/database.native` retains SQLite; `offline/database.web` implements the existing `OutboxDatabase` contract with IndexedDB, including ordering and exclusive replay semantics. |
| Health Connect | Native module/provider is mounted by the root layout. | A platform runtime component omits the provider and all native calls on web while leaving read-only server activity views available. |
| Wear transport | Wear hooks mount from the root layout. | Native runtime only. Web settings explain that pairing is completed from Android. |
| Push notifications | Expo native notification provider mounts globally. | Native runtime only until a distinct service-worker/web-push adapter and permission UX are implemented. |
| Barcode | Camera may render through Expo web but is unverified. | Browser capability detection, permission-denied recovery, manual-entry fallback, and E2E coverage. |
| Localization | Mobile strings are hard-coded English. | Port EN/ES/FR/RU resources and language selection; every visible copy change remains synchronized. |
| Responsive shell | Tab-first phone layout is used at all widths. | At the established `md` breakpoint, use a desktop navigation shell and combined Today workspace without first-click route latency. |
| PWA lifecycle | No Expo web release contract. | Install metadata, service worker, offline/back-online/update-ready UI, cache headers, and update-failure recovery. |
| Static delivery | Root production build/deploy targets Vite. | Add Expo static export beside Vite, self-hosting configuration, cache policy, and release verification before changing the default. |

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
6. Add Expo static export/deploy alongside Vite and run browser parity E2E.
7. Cut authenticated routes first only after data-integrity, accessibility, self-hosting, and rollback checks pass.
8. Retire Vite only after public routes and all production release gates pass.

## Replacement gates

- Cookie auth survives reload, expiry, logout, and account deletion without tokens in Web Storage or IndexedDB.
- Offline mutations survive reload and replay exactly once in server/user order.
- Native-only modules are absent from the web bundle and every corresponding route has intentional browser UX.
- EN/ES/FR/RU, keyboard navigation, screen-reader labels, responsive layouts, and supported-browser E2E pass.
- Public privacy/account-deletion pages, PWA install/update/offline behavior, and self-hosted static deployment pass.
- Vite remains deployable as the rollback target for at least one release after authenticated-route cutover.
