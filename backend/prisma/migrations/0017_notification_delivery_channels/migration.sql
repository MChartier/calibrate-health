ALTER TYPE "InAppNotificationType" ADD VALUE 'GENERIC';

ALTER TABLE "InAppNotification"
    ADD COLUMN "title" TEXT,
    ADD COLUMN "body" TEXT,
    ADD COLUMN "action_url" TEXT,
    ADD COLUMN "dedupe_key" TEXT;

DROP INDEX "InAppNotification_user_id_type_local_date_key";

CREATE UNIQUE INDEX "InAppNotification_user_id_dedupe_key_key"
    ON "InAppNotification"("user_id", "dedupe_key");
