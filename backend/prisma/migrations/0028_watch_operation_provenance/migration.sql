-- AlterTable
ALTER TABLE "ClientOperation" ADD COLUMN "mobile_auth_session_id" INTEGER;

-- CreateIndex
CREATE INDEX "ClientOperation_mobile_session_kind_completed_created_idx"
ON "ClientOperation"("mobile_auth_session_id", "operation_kind", "completed_at", "created_at");

-- AddForeignKey
ALTER TABLE "ClientOperation" ADD CONSTRAINT "ClientOperation_mobile_auth_session_id_fkey"
FOREIGN KEY ("mobile_auth_session_id") REFERENCES "MobileAuthSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
