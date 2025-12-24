-- AlterTable
ALTER TABLE "FoodLog" ADD COLUMN     "local_date" DATE;

-- Backfill existing rows (best-effort: preserves previous server-day semantics).
UPDATE "FoodLog"
SET "local_date" = "date"::date
WHERE "local_date" IS NULL;

-- Require local_date for all future inserts.
ALTER TABLE "FoodLog" ALTER COLUMN "local_date" SET NOT NULL;

-- CreateIndex
CREATE INDEX "FoodLog_user_id_local_date_idx" ON "FoodLog"("user_id", "local_date");

