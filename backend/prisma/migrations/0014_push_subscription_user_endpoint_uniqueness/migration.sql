-- DropIndex
DROP INDEX "PushSubscription_endpoint_key";

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_user_id_endpoint_key" ON "PushSubscription"("user_id", "endpoint");
