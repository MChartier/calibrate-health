-- Add privacy-safe public session ids and browser activity timestamps for the unified trust center.
ALTER TABLE "session_store"
ADD COLUMN "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "session_store_public_id_key" ON "session_store"("public_id");

ALTER TABLE "MobileAuthSession"
ADD COLUMN "public_id" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX "MobileAuthSession_public_id_key" ON "MobileAuthSession"("public_id");

-- Reminder intent is stored as local wall-clock minutes and interpreted in the user's current timezone.
ALTER TABLE "User"
ADD COLUMN "reminder_log_weight_minute" INTEGER NOT NULL DEFAULT 540,
ADD COLUMN "reminder_log_food_minute" INTEGER NOT NULL DEFAULT 540,
ADD COLUMN "reminder_quiet_hours_start_minute" INTEGER,
ADD COLUMN "reminder_quiet_hours_end_minute" INTEGER;

ALTER TABLE "User"
ADD CONSTRAINT "User_reminder_log_weight_minute_check"
CHECK ("reminder_log_weight_minute" BETWEEN 0 AND 1439),
ADD CONSTRAINT "User_reminder_log_food_minute_check"
CHECK ("reminder_log_food_minute" BETWEEN 0 AND 1439),
ADD CONSTRAINT "User_reminder_quiet_hours_pair_check"
CHECK (
  ("reminder_quiet_hours_start_minute" IS NULL AND "reminder_quiet_hours_end_minute" IS NULL)
  OR (
    "reminder_quiet_hours_start_minute" BETWEEN 0 AND 1439
    AND "reminder_quiet_hours_end_minute" BETWEEN 0 AND 1439
    AND "reminder_quiet_hours_start_minute" <> "reminder_quiet_hours_end_minute"
  )
);

-- Keep separate reminder-type receipts so independently timed reminders dedupe over DST repeats.
ALTER TABLE "PushSubscription"
ADD COLUMN "last_sent_weight_local_date" DATE,
ADD COLUMN "last_sent_food_local_date" DATE;

ALTER TABLE "NativePushSubscription"
ADD COLUMN "last_sent_weight_local_date" DATE,
ADD COLUMN "last_sent_food_local_date" DATE;
