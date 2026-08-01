# ADR 0001: Preserve eager navigation with enforced frontend budgets

- Status: Superseded by the Expo web cutover
- Date: 2026-07-12
- Superseded: 2026-07-23

## Context

The primary web routes are an app shell and should remain responsive on first navigation. Route-level lazy loading
would reduce the entry chunk but move that cost to the first click. The production build had only a Vite warning
limit, so an oversized build still succeeded and the single application chunk offered poor cache reuse.

## Decision

Keep primary routes eager. Split stable third-party families into explicit Rollup chunks while keeping barcode code
asynchronous. Emit Vite's build manifest and run `scripts/frontend-build-budget.mjs` after every frontend production
build. Enforce raw and gzip limits for the complete initial JavaScript graph, the largest asynchronous chunk, and the
injected service worker. Store limits in `frontend/build-budgets.json` so changes are explicit and reviewable.

Budgets are guardrails, not performance targets. Raising one requires measured evidence, an explanation in the PR,
and a follow-up reduction plan when the change is not an intentional product tradeoff.

## Consequences

- These budgets applied only to the retired client.
- The Vite-specific budget script and configuration were removed with that client.
- Expo web release validation now checks the Metro export, service worker, static routes, and reachable hashed bundles.
