-- Make every directly user-owned product record disappear with its account.
-- FoodLog.my_food remains ON DELETE SET NULL so its immutable serving snapshots stay valid
-- when an individual library item is removed outside whole-account deletion.
ALTER TABLE "Goal" DROP CONSTRAINT "Goal_user_id_fkey";
ALTER TABLE "Goal"
    ADD CONSTRAINT "Goal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BodyMetric" DROP CONSTRAINT "BodyMetric_user_id_fkey";
ALTER TABLE "BodyMetric"
    ADD CONSTRAINT "BodyMetric_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FoodLog" DROP CONSTRAINT "FoodLog_user_id_fkey";
ALTER TABLE "FoodLog"
    ADD CONSTRAINT "FoodLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FoodLogDay" DROP CONSTRAINT "FoodLogDay_user_id_fkey";
ALTER TABLE "FoodLogDay"
    ADD CONSTRAINT "FoodLogDay_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MyFood" DROP CONSTRAINT "MyFood_user_id_fkey";
ALTER TABLE "MyFood"
    ADD CONSTRAINT "MyFood_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Session rows can exist before login, so ownership is nullable. Backfill existing Passport
-- sessions and keep the column current in PostgresSessionStore on future writes/touches.
ALTER TABLE "session_store" ADD COLUMN "user_id" INTEGER;

UPDATE "session_store" AS session
SET "user_id" = account."id"
FROM "User" AS account
WHERE session."sess" #>> '{passport,user}' = account."id"::TEXT;

CREATE INDEX "session_store_user_id_idx" ON "session_store"("user_id");

ALTER TABLE "session_store"
    ADD CONSTRAINT "session_store_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
