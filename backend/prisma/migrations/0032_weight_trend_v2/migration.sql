-- Store the v2 local rate state alongside the existing latent-weight trend values.
-- Nullable columns allow old rows to remain readable until model-version refresh runs.
ALTER TABLE "BodyMetricTrend"
ADD COLUMN "trend_rate_grams_per_day" DOUBLE PRECISION,
ADD COLUMN "trend_rate_std_grams_per_day" DOUBLE PRECISION;

-- Model 4 refits raw weights with Weight Trend v2. Pending older recommendations
-- must be reviewed again, while applied recommendations and plan revisions remain intact.
UPDATE "CalibrationRecommendation"
SET "status" = 'STALE'
WHERE "status" = 'PENDING'
  AND "model_version" < 4;
