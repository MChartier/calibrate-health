-- Bind native push ownership to the authenticated mobile session and prevent one provider token
-- from remaining active for multiple accounts after a device switches users.
ALTER TABLE "NativePushSubscription"
    ADD COLUMN "mobile_auth_session_id" INTEGER;

UPDATE "NativePushSubscription" AS subscription
SET "mobile_auth_session_id" = (
    SELECT "id"
    FROM "MobileAuthSession"
    WHERE "user_id" = subscription."user_id"
      AND "device_id" = subscription."device_id"
    ORDER BY ("revoked_at" IS NULL) DESC, "updated_at" DESC, "id" DESC
    LIMIT 1
);

WITH ranked_tokens AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "provider", "token"
            ORDER BY ("revoked_at" IS NULL) DESC, "updated_at" DESC, "id" DESC
        ) AS ownership_rank
    FROM "NativePushSubscription"
)
DELETE FROM "NativePushSubscription"
WHERE "id" IN (
    SELECT "id" FROM ranked_tokens WHERE ownership_rank > 1
);

DROP INDEX "NativePushSubscription_user_id_provider_token_key";
CREATE UNIQUE INDEX "NativePushSubscription_provider_token_key"
    ON "NativePushSubscription"("provider", "token");
CREATE INDEX "NativePushSubscription_mobile_auth_session_id_idx"
    ON "NativePushSubscription"("mobile_auth_session_id");

ALTER TABLE "NativePushSubscription"
    ADD CONSTRAINT "NativePushSubscription_mobile_auth_session_id_fkey"
    FOREIGN KEY ("mobile_auth_session_id") REFERENCES "MobileAuthSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
