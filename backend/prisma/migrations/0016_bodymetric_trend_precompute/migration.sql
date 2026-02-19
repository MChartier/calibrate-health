-- Materialize trend/confidence values per metric date to avoid recomputing the model on every read.
CREATE TABLE "BodyMetricTrend" (
  "metric_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "date" DATE NOT NULL,
  "trend_weight_grams" INTEGER NOT NULL,
  "trend_ci_lower_grams" INTEGER NOT NULL,
  "trend_ci_upper_grams" INTEGER NOT NULL,
  "trend_std_grams" INTEGER NOT NULL,
  "model_version" INTEGER NOT NULL DEFAULT 1,
  "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BodyMetricTrend_pkey" PRIMARY KEY ("metric_id")
);

CREATE INDEX "BodyMetricTrend_user_id_date_idx" ON "BodyMetricTrend"("user_id", "date");

ALTER TABLE "BodyMetricTrend"
ADD CONSTRAINT "BodyMetricTrend_metric_id_fkey"
FOREIGN KEY ("metric_id") REFERENCES "BodyMetric"("id") ON DELETE CASCADE ON UPDATE CASCADE;
