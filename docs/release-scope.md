# First hosted release scope

This document records product-completeness decisions for the first hosted consumer release.
The official service is the routine default; Advanced self-hosting remains supported without
expanding the launch beyond the food, weight, and observational activity workflows required for
daily personal use.

## Deployment and server selection

A production Web/PWA deployment is bound to the origin that served it. The official web client uses
the official backend, and a self-hosted web client always uses that deployment's corresponding
same-origin backend; web users are never offered a hosted/custom server switch. Android releases
default to the official service and expose a custom self-hosted origin only under Advanced settings.

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

Activity-driven calorie-target adjustment is outside this release. Any future proposal must
explain the calculation, define how the baseline multiplier changes, and preserve the unadjusted
target for auditability.

## Lose It import

The supported migration path imports food logs and weights from the documented Lose It CSV shapes.
It does not claim to reproduce Lose It exercise, macro-goal, social, or proprietary scoring data.
Imported food logs follow the same immutable calorie snapshot and timezone-local-day rules as new
entries. Account export is the portable application-data escape path; encrypted Postgres backups are
the disaster-recovery mechanism.

## Launch clients and language

The first release is English-only across Web/PWA, Android, iOS, and Wear OS. Stored language
preference data does not mean those clients are translated. Additional languages require every
workflow, permission rationale, Tile, and notification string to have equivalent translations.
Release notes and store metadata must state the English-only boundary.

