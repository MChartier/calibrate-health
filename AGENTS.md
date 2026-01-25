# calibrate — Intent, Goals, and Design Requirements

## Product Intent
calibrate is a responsive calorie tracker (desktop + mobile web) for users who want to lose, maintain, or gain weight by monitoring calorie intake vs. expected calorie expenditure.

## Target Stack
- Frontend: React + TypeScript + Vite (UI via MUI + React Query)
- Backend: Node.js + TypeScript + Express
- Auth: Email/password (Passport Local + cookie session)
- Persistence: Postgres (Prisma ORM)
- Deploy: Web-hosted and self-hostable via Docker (docker-compose app + proxy; Postgres external or separate service)

## MVP Scope (Required)
- Authentication and multi-user support (self-hosted instances should support multiple accounts).
- User profile required for calorie math:
  - Age (prefer storing date of birth), sex, height, current weight, timezone, unit preference (imperial/metric), activity level.
- Goal configuration:
  - Start weight, target weight, and a signed daily calorie change (deficit or surplus).
  - Allowed daily calorie change magnitudes: `0`, `250`, `500`, `750`, `1000` kcal/day.
    - Positive values = deficit (lose), negative values = surplus (gain), `0` = maintenance.
- Daily food logging (manual entry required):
  - Food name, calories, meal category, and the user’s “day” (based on user timezone).
  - Fixed meal categories:
    - `Breakfast`, `Morning Snack`, `Lunch`, `Afternoon Snack`, `Dinner`, `Evening Snack`
- Weight logging:
  - Weight entries over time (at least one per day; UX should make “daily weigh-in” easy).
  - “Day” grouping must respect the user’s timezone.
- Visualization:
  - Daily calories consumed vs. daily target.
  - Weight trend over time.
  - Goal projection (estimated date to reach target weight based on steady deficit/surplus; none for maintenance).

## Current Additions (Implemented)
- External food search providers (FatSecret default; USDA optional with API key; Open Food Facts fallback), including barcode lookups.
- My Foods library + recipe builder with ingredient snapshots for reuse.
- Lose It CSV import for food logs + weights (onboarding + settings).
- Installable PWA (manifest + quick-add shortcuts).
- Localization with a stored user language preference (currently en/es/fr/ru).
- Optional profile photo avatars (cropped/resized and stored inline with the user record).

## Calorie/Weight Math (Initial Approach)
- BMR: Mifflin–St Jeor.
- TDEE: `BMR * activityMultiplier`.
- Daily calorie target: `TDEE - daily_deficit`.
  - `daily_deficit` is signed: positive = deficit (lose), negative = surplus (gain), `0` = maintenance.
  - Allowed magnitudes: `0`, `250`, `500`, `750`, `1000` kcal/day.
- Projection model: constant deficit/surplus using `3500 kcal/lb` (or `7700 kcal/kg`) to estimate time-to-goal.
  - We project a date from the steady rate; we do not dynamically adjust the deficit to hit a chosen date.
  - Maintenance goals do not show a projection date.

## “Calories Out” (MVP)
- Do not infer expenditure from weight changes (too noisy and not actionable).
- For MVP, “calories out” is the estimated TDEE from the profile’s activity level.
- Future: optional integrations (steps/exercise providers) may refine “calories out”.

## Units, Locale, and Time
- Users can choose imperial or metric units (lb/kg and in/cm).
- Store weights in grams and heights in millimeters; convert at the edges for UI/API.
- User timezone is stored as an IANA string (e.g. `America/Los_Angeles`).
- User language is stored as a short code (e.g. `en`, `es`) and drives i18n.
- “Day” boundaries are determined by the user’s timezone (not the server timezone).
  - Prefer storing timestamps in UTC and computing “local day” using the user’s timezone, or store a `local_date` (DATE) alongside events to avoid DST edge cases.

## Self-Hosting and Dev Workflow Requirements
- Self-hosting: deploy with docker-compose; the `deploy/` stack expects an external Postgres unless you add one.
- Local development (devcontainer): run services directly (e.g., `npm run dev` at repo root, or `npm run dev` in `backend/` and `frontend/`); avoid docker-in-docker workflows for development.
- Devcontainer + docker-compose read secrets from the repo root `.env`; local backend runs use `backend/.env`.
- Dev-only dashboard at `/dev` compares food providers and tests barcode scanning.

## Non-Goals (for MVP)
- No native mobile app (web client only; keep the API shape amenable to future mobile).
- No automatic activity import (steps/exercise) in MVP.
- No “smart” deficit adjustments to hit a specific target date.
- No advanced body composition modeling (beyond optional fields like body fat % if present).

## Current Repo Notes (Keep Aligned With Goals)
- Prisma is configured for Postgres (Prisma schema + migrations live under `backend/prisma/`).
- Prisma migrations should use ordinal prefixes (e.g., `0001_init`, `0002_...`) for folder names. When running `prisma migrate dev`, pass an ordinal in the `--name` (it will still be timestamp-prefixed by Prisma; rename to the ordinal style before sharing if still local/unapplied).
- Add concise documentation comments to new components and functions to capture intent, behavior, and rationale (avoid hand-wavy summaries; prefer clear “why/how” notes).
- Local-day grouping is stored as date-only fields (`FoodLog.local_date`, `BodyMetric.date`) derived from `User.timezone`; keep timezone math consistent in logging + imports.
- Food data providers live in `backend/src/services/foodData`; `FOOD_DATA_PROVIDER` selects the provider (`fatsecret`, `usda`, `openfoodfacts`). FatSecret requires `FATSECRET_CLIENT_ID` + `FATSECRET_CLIENT_SECRET`; USDA requires `USDA_API_KEY`. Missing credentials fall back to Open Food Facts.
- Goal deficit rules live in `shared/goalDeficit.ts`; use these shared constants/helpers to keep frontend + backend aligned on allowed values and sign conventions.
- UI strings live in `frontend/src/i18n/resources.ts` (supported languages in `frontend/src/i18n/languages.ts` and `backend/src/utils/language.ts`); add/update keys across all languages when editing copy.
- Keep the FatSecret attribution link intact (`frontend/src/components/FatSecretAttributionLink.tsx`) when FatSecret is active.
- Food logs are immutable snapshots; My Foods/recipe edits should not retroactively mutate existing `FoodLog` entries (see serving snapshot fields in the schema).
- Profile photos are stored inline as small, processed avatars (see `backend/src/utils/profileImage.ts` for format/size caps).
- Dev seed data creates `test@calibratehealth.app`; `AUTO_LOGIN_TEST_USER=true` auto-logs in locally, and `/dev/test/reset-test-user-onboarding` (or `npm run dev:reset-test-user-onboarding`) resets onboarding.

## Code Review Preferences (UI / Frontend)
- Avoid magic numbers for layout/styling (e.g., widths, opacities); prefer named constants, theme tokens, or wrapper presets.
- When introducing new constants (layout or motion), include a short comment describing what the constant controls.
- Keep JSX readable: avoid long chained ternaries and heavy inline `sx` logic; assign to well-named variables or small documented helpers.
- Avoid nested ternary operators; prefer `switch`/`if` with a brief comment when mapping state -> UI text or UI variants.
- For mutually exclusive render branches (one-of-N), compute the active sub-tree in a named variable/helper above the JSX and render it once.
- For domain string unions used in comparisons or `<Select />` values (units, sex, etc.), prefer shared exported constants/enums over repeating raw string literals.
- Prefer ASCII punctuation in UI strings (avoid `\\u00b7`, `\\u2026`, etc.) to prevent rendering/copy-paste issues; use `|`, `-`, or `...` instead.
- Deduplicate repeated UI mappings (e.g., enums -> icons/labels) into shared utilities/components when used in multiple places.
- Prefer shaped loading placeholders that keep stable UI chrome rendered; avoid duplicating entire feature layouts in separate "Skeleton" components unless there is a clear justification.
- For animations/transitions, encapsulate math/state in small hooks/helpers and include comments describing the intended UX effect (respect `prefers-reduced-motion`).
- Keep abstractions lean: if a wrapper/prop/type isn't used, remove it rather than carrying extra API surface "just in case".
- Keep `ui/` focused on generic primitives/wrappers; place feature-specific components under `components/` (or feature folders).

## Code Review Preferences (Backend / API)
- When adding new API serialization helpers, prefer explicit input/output types that describe the wire shape (especially for Date fields).
- When refactoring DB connection plumbing (DATABASE_URL/DB_* parsing), preserve Prisma datasource query params like `schema` (or pass an explicit equivalent) so non-public schema deployments don't regress silently.
- Prefer explicit environment helper naming (e.g. production/staging) over ambiguous "production-like" terms, and include a short "why" comment when behavior intentionally differs between deployed envs and local dev; consider self-hosting workflows when choosing defaults.
- Make warnings actionable: include the consequence and the next step (what env var / config to set) when emitting `console.warn` messages.
- Avoid duplicating time math constants like `1000 * 60 * 60 * 24`; prefer shared exported constants for common durations (day/week/session TTL).
