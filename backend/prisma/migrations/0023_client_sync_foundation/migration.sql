-- Durable idempotency receipts and an ordered per-user change feed for offline native clients.
CREATE TABLE "ClientOperation" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "operation_id" TEXT NOT NULL,
    "operation_kind" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ClientOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncChange" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "operation_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientOperation_user_id_operation_id_key"
    ON "ClientOperation"("user_id", "operation_id");
CREATE INDEX "ClientOperation_user_id_created_at_idx"
    ON "ClientOperation"("user_id", "created_at");
CREATE INDEX "SyncChange_user_id_id_idx"
    ON "SyncChange"("user_id", "id");
CREATE INDEX "SyncChange_user_id_entity_type_entity_id_idx"
    ON "SyncChange"("user_id", "entity_type", "entity_id");

ALTER TABLE "ClientOperation"
    ADD CONSTRAINT "ClientOperation_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SyncChange"
    ADD CONSTRAINT "SyncChange_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
