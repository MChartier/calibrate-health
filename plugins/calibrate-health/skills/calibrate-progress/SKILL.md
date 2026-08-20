---
name: calibrate-progress
description: Analyze recent food logging and weight progress through the authenticated Calibrate MCP service. Use when the user asks about calorie adherence, logged eating patterns, scale changes, weight trend, goal pace, plateaus, or overall progress recorded in Calibrate.
---

# Discuss Calibrate Progress

Use the authenticated Calibrate account as the source of truth for logged food, tracking-day status, weight observations, modeled trend, calorie target, and configured goal.

## Workflow

1. Call `get_recent_food_logs` and `get_weight_trend` when the question concerns overall progress. Use only the narrower relevant tool for a food-only or weight-only question.
2. Use the user's requested period when it fits the tool bounds. Otherwise start with 14 food days and 90 weight days, and state the actual ranges returned.
3. Separate observations from interpretation:
   - Food entries and raw weights are observations.
   - Weight trend, confidence intervals, pace, and projection are model estimates.
   - The current calorie target is context as of the snapshot date, not necessarily the historical target for every returned day.
4. Lead with a concise, evidence-based progress summary. Then explain supporting patterns, uncertainty, and one or two practical next steps.

## Food-log interpretation

- Use only days marked `COMPLETE` and `is_representative: true` for intake averages or target-adherence claims.
- Treat `OPEN`, `INCOMPLETE`, `PAUSED`, and pre-tracking days as context. Never describe missing or partial logging as genuine low intake.
- Describe individual entries only when useful to the user's question. Do not moralize foods or label a day "good" or "bad."
- Calibrate food logs contain calories and serving snapshots, not complete macro- or micronutrient data. Do not infer protein, nutrient quality, or deficiencies from names alone.
- The returned calorie target is the current plan. Be explicit when comparing it with older log days.

## Weight-trend interpretation

- Distinguish raw scale readings from the latent trend. Prefer the trend for direction and pace while acknowledging its confidence interval.
- Honor `evidence_status`, `freshness`, and nullable pace. If `weekly_rate` is null, stale, outdated, or based on limited evidence, do not invent or extrapolate a current rate.
- Explain short-term changes cautiously; hydration and normal measurement variability can move scale weight without reflecting tissue change.
- Positive `configured_daily_deficit_kcal` means a weight-loss goal, negative means weight gain, and zero means maintenance.
- Never replace or reinterpret `profile_estimated_tdee_kcal` using observed intake and weight. Calibrate's calories-out remains the profile-estimated TDEE.

## Safety and privacy

- Keep discussion informational and supportive, not diagnostic or prescriptive medical care.
- For alarming symptoms, rapid unexplained changes, pregnancy-specific needs, eating-disorder concerns, or medication questions, recommend an appropriate licensed clinician rather than calculating a treatment plan.
- Do not request account IDs, credentials, OAuth tokens, provider identifiers, or barcodes. Authentication is handled by Calibrate's OAuth flow.
- Do not share Calibrate data with another service unless the user separately requests it.
