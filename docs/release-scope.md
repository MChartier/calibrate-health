# First native release scope

This document records product-completeness decisions for the first high-quality self-hosted release.
It prevents optional expansion from obscuring the food, weight, and activity workflows required for
daily personal use.

## Nutrition

The first release remains calorie-first. Manual foods, provider foods, recipes, and food-log entries
must preserve immutable calorie and serving snapshots, but macronutrient goals and protein,
carbohydrate, and fat snapshots are not release requirements. Macros should be added only as one
coherent schema/API/web/Android/Wear migration rather than as provider-only fields that make manual
and imported entries inconsistent.

## Activity and calorie targets

Health Connect and watch activity are observational inputs in the first release. They populate
activity records, daily summaries, and calories-out context, but they do not automatically raise or
lower the configured calorie target. The target continues to use profile TDEE and the signed goal
deficit. This avoids double-counting exercise already represented by the profile activity multiplier.

An activity-adjusted target may become an opt-in feature later, but it must explain the calculation,
define how the baseline multiplier changes, and preserve the unadjusted target for auditability.

## Lose It import

The supported migration path imports food logs and weights from the documented Lose It CSV shapes.
It does not claim to reproduce Lose It exercise, macro-goal, social, or proprietary scoring data.
Imported food logs follow the same immutable calorie snapshot and timezone-local-day rules as new
entries. Account export is the portable application-data escape path; encrypted Postgres backups are
the disaster-recovery mechanism.

## Language support

The web client supports the stored `en`, `es`, `fr`, and `ru` language preferences. The first private
Android and Wear release is English-only until every native workflow, permission rationale, Tile, and
notification string has equivalent translations. Release notes and store metadata must state this
boundary; the project must not imply that the web language preference localizes the native clients.

