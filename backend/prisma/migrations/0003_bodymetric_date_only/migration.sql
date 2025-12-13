-- DropIndex
DROP INDEX IF EXISTS "BodyMetric_user_id_date_key";

-- Dedupe: keep newest entry per user/day
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "user_id", ("date"::date)
      ORDER BY "date" DESC, "id" DESC
    ) AS rn
  FROM "BodyMetric"
)
DELETE FROM "BodyMetric"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

-- AlterTable
ALTER TABLE "BodyMetric"
ALTER COLUMN "date" TYPE DATE
USING "date"::date;

ALTER TABLE "BodyMetric"
ALTER COLUMN "date" SET DEFAULT CURRENT_DATE;

-- CreateIndex
CREATE UNIQUE INDEX "BodyMetric_user_id_date_key" ON "BodyMetric"("user_id", "date");

