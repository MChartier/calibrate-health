-- CreateTable
CREATE TABLE "WearPairingCredential" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "issuing_mobile_session_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "server_origin" TEXT NOT NULL,
    "watch_device_id" TEXT NOT NULL,
    "watch_device_name" TEXT,
    "protocol_version" INTEGER NOT NULL,
    "challenge" TEXT NOT NULL,
    "watch_public_key_spki" TEXT NOT NULL,
    "exchange_id_hash" TEXT,
    "created_mobile_session_id" INTEGER,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WearPairingCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WearPairingCredential_token_hash_key"
ON "WearPairingCredential"("token_hash");

CREATE INDEX "WearPairingCredential_user_id_expires_at_idx"
ON "WearPairingCredential"("user_id", "expires_at");

CREATE INDEX "WearPairingCredential_issuing_mobile_session_id_expires_at_idx"
ON "WearPairingCredential"("issuing_mobile_session_id", "expires_at");

CREATE UNIQUE INDEX "WearPairingCredential_created_mobile_session_id_key"
ON "WearPairingCredential"("created_mobile_session_id");

-- AddForeignKey
ALTER TABLE "WearPairingCredential" ADD CONSTRAINT "WearPairingCredential_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WearPairingCredential" ADD CONSTRAINT "WearPairingCredential_issuing_mobile_session_id_fkey"
FOREIGN KEY ("issuing_mobile_session_id") REFERENCES "MobileAuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WearPairingCredential" ADD CONSTRAINT "WearPairingCredential_created_mobile_session_id_fkey"
FOREIGN KEY ("created_mobile_session_id") REFERENCES "MobileAuthSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
