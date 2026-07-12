-- Browser push subscriptions are ephemeral. Existing rows predate session
-- ownership and cannot be bound safely, so this migration revokes them. Users
-- must re-enable browser notifications once after upgrading.
DELETE FROM "PushSubscription";

-- Add global endpoint ownership alongside the existing per-user lookup key.
-- Registration can now atomically transfer the endpoint to the current account.
ALTER TABLE "PushSubscription" ADD COLUMN "session_sid" TEXT NOT NULL;
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_session_sid_idx" ON "PushSubscription"("session_sid");
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_session_sid_fkey"
FOREIGN KEY ("session_sid") REFERENCES "session_store"("sid") ON DELETE CASCADE ON UPDATE CASCADE;
