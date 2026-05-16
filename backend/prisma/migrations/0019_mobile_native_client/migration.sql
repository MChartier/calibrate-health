-- Native Android client support: opaque mobile sessions plus native push tokens.
CREATE TYPE "MobileDevicePlatform" AS ENUM ('ANDROID_PHONE', 'WEAR_OS');
CREATE TYPE "NativePushPlatform" AS ENUM ('ANDROID');
CREATE TYPE "NativePushProvider" AS ENUM ('EXPO', 'FCM');

CREATE TABLE "MobileAuthSession" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_platform" "MobileDevicePlatform" NOT NULL,
    "device_name" TEXT,
    "access_token_hash" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "access_expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileAuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NativePushSubscription" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_id" TEXT NOT NULL,
    "platform" "NativePushPlatform" NOT NULL DEFAULT 'ANDROID',
    "provider" "NativePushProvider" NOT NULL,
    "token" TEXT NOT NULL,
    "last_sent_local_date" DATE,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NativePushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileAuthSession_access_token_hash_key" ON "MobileAuthSession"("access_token_hash");
CREATE UNIQUE INDEX "MobileAuthSession_refresh_token_hash_key" ON "MobileAuthSession"("refresh_token_hash");
CREATE INDEX "MobileAuthSession_user_id_idx" ON "MobileAuthSession"("user_id");
CREATE INDEX "MobileAuthSession_user_id_device_id_revoked_at_idx" ON "MobileAuthSession"("user_id", "device_id", "revoked_at");

CREATE UNIQUE INDEX "NativePushSubscription_user_id_provider_token_key" ON "NativePushSubscription"("user_id", "provider", "token");
CREATE INDEX "NativePushSubscription_user_id_idx" ON "NativePushSubscription"("user_id");
CREATE INDEX "NativePushSubscription_user_id_device_id_idx" ON "NativePushSubscription"("user_id", "device_id");

ALTER TABLE "MobileAuthSession"
    ADD CONSTRAINT "MobileAuthSession_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NativePushSubscription"
    ADD CONSTRAINT "NativePushSubscription_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
