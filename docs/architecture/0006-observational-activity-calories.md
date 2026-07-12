# ADR 0006: Keep imported activity observational

- Status: Accepted
- Date: 2026-07-12

## Context

The configured calorie target already uses profile BMR, an activity-level multiplier, and the signed goal deficit.
Health Connect can report steps, active calories, total calories, exercise sessions, and optional weight from
multiple origins. Automatically adding those calories to the target would risk counting activity already represented
by the profile multiplier and would make the daily target depend on delayed or overlapping device data.

## Decision

Read Health Connect data on the Android phone only. Samsung Health remains responsible for moving Galaxy Watch data
into Health Connect; the Wear application does not collect activity sensors directly.

Store source records for provenance, deletion reconciliation, and export. Store Health Connect aggregate day
summaries as the displayed values for steps and calories because the aggregate query applies origin priority before
upload. Present activity and freshness alongside the profile-based calorie target, but never use imported activity
to change BMR, TDEE, `daily_deficit`, or the target. Manual Calibrate weight remains authoritative for a day when an
optional imported weight overlaps it.

## Consequences

- Food and weight tracking remain functional when Health Connect is absent, paused, stale, or revoked.
- Daily targets remain explainable and stable while activity data can still inform the user.
- Exercise calories are not automatically earned back, so the app must label them as observations rather than target
  adjustments.
- The watch can display cached activity context without requesting body-sensor or workout permissions.
- Any future activity-adjusted target is a separate opt-in product and architecture decision that must define its
  baseline and prevent double counting.
