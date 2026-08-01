-- CreateEnum
CREATE TYPE "FoodLogDayStatus" AS ENUM ('OPEN', 'COMPLETE', 'INCOMPLETE', 'PAUSED');

-- CreateEnum
CREATE TYPE "FoodLogDayOrigin" AS ENUM ('USER', 'PAUSE', 'IMPORT');

-- AlterTable
ALTER TABLE "FoodLogDay"
ADD COLUMN "status" "FoodLogDayStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "origin" "FoodLogDayOrigin" NOT NULL DEFAULT 'USER';

UPDATE "FoodLogDay"
SET "status" = CASE
  WHEN "is_complete" THEN 'COMPLETE'::"FoodLogDayStatus"
  ELSE 'OPEN'::"FoodLogDayStatus"
END;

ALTER TABLE "FoodLogDay" DROP COLUMN "is_complete";

-- CreateTable
CREATE TABLE "FoodTrackingPause" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "starts_on" DATE NOT NULL,
  "expected_resume_on" DATE,
  "resumed_on" DATE,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resumed_at" TIMESTAMP(3),
  "materialized_through" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FoodTrackingPause_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FoodTrackingPause_user_id_starts_on_idx"
ON "FoodTrackingPause"("user_id", "starts_on");

CREATE INDEX "FoodTrackingPause_user_id_resumed_on_idx"
ON "FoodTrackingPause"("user_id", "resumed_on");

CREATE UNIQUE INDEX "FoodTrackingPause_one_active_per_user"
ON "FoodTrackingPause"("user_id")
WHERE "resumed_on" IS NULL;

ALTER TABLE "FoodTrackingPause"
ADD CONSTRAINT "FoodTrackingPause_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
