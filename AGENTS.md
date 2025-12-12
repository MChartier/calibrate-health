# cal-io — Intent, Goals, and Design Requirements

## Product Intent
cal-io is a responsive calorie tracker (desktop + mobile web) for users who want to lose (or manage) weight by monitoring calorie intake vs. expected calorie expenditure.

## Target Stack
- Frontend: React + TypeScript + Vite (UI via MUI)
- Backend: Node.js + TypeScript + Express
- Auth: Email/password (Passport Local + cookie session)
- Persistence: Postgres (Prisma ORM)
- Deploy: Web-hosted and self-hostable via Docker (docker-compose with a DB service)

## MVP Scope (Required)
- Authentication and multi-user support (self-hosted instances should support multiple accounts).
- User profile required for calorie math:
  - Age (prefer storing date of birth), sex, height, current weight, timezone, unit preference (imperial/metric), activity level.
  - Target deficit selection: one of `250`, `500`, `750`, `1000` kcal/day.
- Daily food logging (manual entry):
  - Food name, calories, meal category, and the user’s “day” (based on user timezone).
  - Fixed meal categories:
    - `Breakfast`, `Morning Snack`, `Lunch`, `Afternoon Snack`, `Dinner`, `Evening Snack`
- Weight logging:
  - Weight entries over time (at least one per day; UX should make “daily weigh-in” easy).
  - “Day” grouping must respect the user’s timezone.
- Visualization:
  - Daily calories consumed vs. daily target.
  - Weight trend over time.
  - Goal projection (estimated date to reach target weight based on steady deficit).

## Calorie/Weight Math (Initial Approach)
- BMR: Mifflin–St Jeor.
- TDEE: `BMR * activityMultiplier`.
- Daily calorie target: `TDEE - targetDeficit`.
  - Deficit is user-selected (see MVP).
- Projection model: constant deficit using `3500 kcal/lb` (or `7700 kcal/kg`) to estimate time-to-goal.
  - We project a date from the steady rate; we do not dynamically adjust the deficit to hit a chosen date.

## “Calories Out” (MVP)
- Do not infer expenditure from weight changes (too noisy and not actionable).
- For MVP, “calories out” is the estimated TDEE from the profile’s activity level.
- Future: optional integrations (steps/exercise providers) may refine “calories out”.

## Units, Locale, and Time
- Users can choose imperial or metric units (lb/kg and in/cm).
- “Day” boundaries are determined by the user’s timezone (not the server timezone).
  - Prefer storing timestamps in UTC and computing “local day” using the user’s timezone, or store a `local_date` (DATE) alongside events to avoid DST edge cases.

## Self-Hosting and Dev Workflow Requirements
- Self-hosting: docker-compose with Postgres as a separate service.
- Local development (devcontainer): run services directly (e.g., `npm run dev` at repo root, or `npm run dev` in `backend/` and `frontend/`); avoid docker-in-docker workflows for development.

## Non-Goals (for MVP)
- No external food database/search integration (manual entry only).
- No native mobile app (web client only; keep the API shape amenable to future mobile).
- No automatic activity import (steps/exercise) in MVP.
- No “smart” deficit adjustments to hit a specific target date.
- No advanced body composition modeling (beyond optional fields like body fat % if present).

## Current Repo Notes (Keep Aligned With Goals)
- The repo currently includes Prisma schema files under `backend/prisma/`. Ensure the database/provider aligns with the Postgres requirement (avoid drifting between SQLite for dev and Postgres for deploy).
