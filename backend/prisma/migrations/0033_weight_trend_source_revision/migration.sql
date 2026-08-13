-- Track the exact raw observation snapshot behind each materialized trend batch.
-- Existing rows remain readable but are refreshed because a null revision is stale.
ALTER TABLE "BodyMetricTrend"
ADD COLUMN "source_revision" VARCHAR(64);
