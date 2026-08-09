-- Store birth dates as calendar-only values and add sticky, non-destructive safety review markers.
ALTER TABLE "User"
ALTER COLUMN "date_of_birth" TYPE DATE USING "date_of_birth"::date;

CREATE TYPE "CaloriePlanReviewStatus" AS ENUM ('CLEAR', 'REQUIRES_REVIEW');

ALTER TABLE "Goal"
ADD COLUMN "calorie_plan_review_status" "CaloriePlanReviewStatus" NOT NULL DEFAULT 'CLEAR',
ADD COLUMN "calorie_plan_review_reason" TEXT;

ALTER TABLE "CaloriePlanRevision"
ADD COLUMN "calorie_plan_review_status" "CaloriePlanReviewStatus" NOT NULL DEFAULT 'CLEAR',
ADD COLUMN "calorie_plan_review_reason" TEXT;

-- Flag unsafe historical goals without changing any health or goal values.
WITH plan_inputs AS (
    SELECT
        g."id" AS goal_id,
        g."start_weight_grams",
        g."target_weight_grams",
        g."daily_deficit",
        u."date_of_birth",
        u."sex",
        u."height_mm",
        u."activity_level",
        CASE WHEN tz.name IS NULL THEN NULL ELSE (CURRENT_TIMESTAMP AT TIME ZONE u."timezone")::date END AS local_today,
        metric."weight_grams" AS latest_weight_grams
    FROM "Goal" g
    JOIN "User" u ON u."id" = g."user_id"
    LEFT JOIN pg_timezone_names tz ON LOWER(tz.name) = LOWER(u."timezone")
    LEFT JOIN LATERAL (
        SELECT m."weight_grams"
        FROM "BodyMetric" m
        WHERE m."user_id" = u."id"
          AND tz.name IS NOT NULL
          AND m."date" <= (CURRENT_TIMESTAMP AT TIME ZONE u."timezone")::date
        ORDER BY m."date" DESC, m."id" DESC
        LIMIT 1
    ) metric ON TRUE
), calculated AS (
    SELECT *,
        CASE WHEN date_of_birth IS NULL OR local_today IS NULL THEN NULL ELSE
            EXTRACT(YEAR FROM local_today)::integer - EXTRACT(YEAR FROM date_of_birth)::integer
            - CASE WHEN TO_CHAR(local_today, 'MM-DD') < TO_CHAR(date_of_birth, 'MM-DD') THEN 1 ELSE 0 END
        END AS age_years,
        CASE WHEN sex IS NULL OR height_mm IS NULL OR latest_weight_grams IS NULL OR date_of_birth IS NULL OR local_today IS NULL THEN NULL ELSE
            ROUND((10 * (latest_weight_grams::numeric / 1000) + 6.25 * (height_mm::numeric / 10)
                - 5 * (EXTRACT(YEAR FROM local_today)::integer - EXTRACT(YEAR FROM date_of_birth)::integer
                - CASE WHEN TO_CHAR(local_today, 'MM-DD') < TO_CHAR(date_of_birth, 'MM-DD') THEN 1 ELSE 0 END)
                + CASE WHEN sex = 'MALE' THEN 5 ELSE -161 END), 1)
        END AS bmr
    FROM plan_inputs
), targets AS (
    SELECT *,
        CASE WHEN bmr IS NULL OR activity_level IS NULL THEN NULL ELSE ROUND(bmr * CASE activity_level
            WHEN 'SEDENTARY' THEN 1.2 WHEN 'LIGHT' THEN 1.375 WHEN 'MODERATE' THEN 1.55
            WHEN 'ACTIVE' THEN 1.725 WHEN 'VERY_ACTIVE' THEN 1.9 END, 1)
        END AS tdee
    FROM calculated
), reviewed AS (
    SELECT goal_id, CASE
        WHEN date_of_birth IS NULL THEN 'DATE_OF_BIRTH_REQUIRED'
        WHEN local_today IS NULL THEN 'TIMEZONE_INVALID'
        WHEN date_of_birth > local_today THEN 'DATE_OF_BIRTH_IN_FUTURE'
        WHEN age_years < 18 THEN 'AGE_UNDER_18'
        WHEN age_years > 120 THEN 'AGE_OVER_120'
        WHEN sex IS NULL THEN 'SEX_REQUIRED'
        WHEN activity_level IS NULL THEN 'ACTIVITY_LEVEL_REQUIRED'
        WHEN height_mm IS NULL THEN 'HEIGHT_REQUIRED'
        WHEN height_mm < 1000 OR height_mm > 2500 THEN 'HEIGHT_OUT_OF_RANGE'
        WHEN latest_weight_grams IS NULL THEN 'LATEST_WEIGHT_REQUIRED'
        WHEN latest_weight_grams < 25000 OR latest_weight_grams > 400000 THEN 'WEIGHT_OUT_OF_RANGE'
        WHEN start_weight_grams < 25000 OR start_weight_grams > 400000
          OR target_weight_grams < 25000 OR target_weight_grams > 400000 THEN 'GOAL_WEIGHTS_OUT_OF_RANGE'
        WHEN daily_deficit NOT IN (-1000, -750, -500, -250, 0, 250, 500, 750, 1000) THEN 'DAILY_DEFICIT_INVALID'
        WHEN (daily_deficit > 0 AND start_weight_grams <= target_weight_grams)
          OR (daily_deficit < 0 AND start_weight_grams >= target_weight_grams) THEN 'GOAL_DIRECTION_INVALID'
        WHEN ROUND(tdee - daily_deficit) < CEIL(GREATEST(bmr, 1000)) THEN 'TARGET_BELOW_MINIMUM'
        ELSE NULL
    END AS reason_code
    FROM targets
)
UPDATE "Goal" g
SET "calorie_plan_review_status" = 'REQUIRES_REVIEW',
    "calorie_plan_review_reason" = reviewed.reason_code
FROM reviewed
WHERE reviewed.goal_id = g."id" AND reviewed.reason_code IS NOT NULL;

-- Inherit reviewed source goals independently of timezone validity so no revision can disappear from the backfill.
UPDATE "CaloriePlanRevision" r
SET "calorie_plan_review_status" = 'REQUIRES_REVIEW',
    "calorie_plan_review_reason" = 'HISTORICAL_PLAN_REQUIRES_REVIEW'
FROM "Goal" g
WHERE g."id" = r."source_goal_id"
  AND g."calorie_plan_review_status" = 'REQUIRES_REVIEW';
-- Revisions inherit an unsafe source goal or are independently flagged when their adjusted target is below the floor.
WITH revision_inputs AS (
    SELECT
        r."id" AS revision_id,
        r."target_adjustment_kcal",
        g."daily_deficit",
        g."calorie_plan_review_status" AS goal_review_status,
        u."date_of_birth",
        u."sex",
        u."height_mm",
        u."activity_level",
        (CURRENT_TIMESTAMP AT TIME ZONE u."timezone")::date AS local_today,
        metric."weight_grams" AS latest_weight_grams
    FROM "CaloriePlanRevision" r
    JOIN "Goal" g ON g."id" = r."source_goal_id"
    JOIN "User" u ON u."id" = r."user_id"
    JOIN pg_timezone_names tz ON LOWER(tz.name) = LOWER(u."timezone")
    LEFT JOIN LATERAL (
        SELECT m."weight_grams" FROM "BodyMetric" m
        WHERE m."user_id" = u."id" AND m."date" <= (CURRENT_TIMESTAMP AT TIME ZONE u."timezone")::date
        ORDER BY m."date" DESC, m."id" DESC LIMIT 1
    ) metric ON TRUE
), revision_targets AS (
    SELECT *,
        ROUND((10 * (latest_weight_grams::numeric / 1000) + 6.25 * (height_mm::numeric / 10)
            - 5 * (EXTRACT(YEAR FROM local_today)::integer - EXTRACT(YEAR FROM date_of_birth)::integer
            - CASE WHEN TO_CHAR(local_today, 'MM-DD') < TO_CHAR(date_of_birth, 'MM-DD') THEN 1 ELSE 0 END)
            + CASE WHEN sex = 'MALE' THEN 5 ELSE -161 END), 1) AS bmr
    FROM revision_inputs
), revision_evaluated AS (
    SELECT *, ROUND(bmr * CASE activity_level
        WHEN 'SEDENTARY' THEN 1.2 WHEN 'LIGHT' THEN 1.375 WHEN 'MODERATE' THEN 1.55
        WHEN 'ACTIVE' THEN 1.725 WHEN 'VERY_ACTIVE' THEN 1.9 END, 1) AS tdee
    FROM revision_targets
)
UPDATE "CaloriePlanRevision" r
SET "calorie_plan_review_status" = 'REQUIRES_REVIEW',
    "calorie_plan_review_reason" = CASE
        WHEN evaluated.goal_review_status = 'REQUIRES_REVIEW' THEN 'HISTORICAL_PLAN_REQUIRES_REVIEW'
        ELSE 'PLAN_REVISION_UNSAFE'
    END
FROM revision_evaluated evaluated
WHERE evaluated.revision_id = r."id"
  AND (evaluated.goal_review_status = 'REQUIRES_REVIEW'
    OR ROUND(evaluated.tdee - evaluated.daily_deficit + evaluated.target_adjustment_kcal)
       < CEIL(GREATEST(evaluated.bmr, 1000)));

-- Keep unsafe accepted revisions sticky even if a future revision is later canceled.
UPDATE "Goal" g
SET "calorie_plan_review_status" = 'REQUIRES_REVIEW',
    "calorie_plan_review_reason" = 'PLAN_REVISION_UNSAFE'
WHERE g."calorie_plan_review_status" = 'CLEAR'
  AND EXISTS (
    SELECT 1
    FROM "CaloriePlanRevision" r
    WHERE r."source_goal_id" = g."id"
      AND r."calorie_plan_review_status" = 'REQUIRES_REVIEW'
      AND r."calorie_plan_review_reason" = 'PLAN_REVISION_UNSAFE'
  );

-- Pre-policy pending recommendations must be regenerated under policy version 1.
UPDATE "CalibrationRecommendation" SET "status" = 'STALE' WHERE "status" = 'PENDING';
