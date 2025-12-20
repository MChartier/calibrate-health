-- AlterTable
ALTER TABLE "FoodLog"
ALTER COLUMN "date" TYPE DATE
USING "date"::date;

ALTER TABLE "FoodLog"
ALTER COLUMN "date" SET DEFAULT CURRENT_DATE;

-- Index for common "day" queries.
CREATE INDEX IF NOT EXISTS "FoodLog_user_id_date_idx" ON "FoodLog"("user_id", "date");

