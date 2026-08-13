CREATE TYPE "AccountTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

ALTER TABLE "User" ADD COLUMN "email_verified_at" TIMESTAMP(3);

-- Existing accounts predate verification. Preserve access without inventing consent records.
UPDATE "User" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;

CREATE TABLE "AccountActionToken" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "purpose" "AccountTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    CONSTRAINT "AccountActionToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalAcceptance" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "terms_version" TEXT NOT NULL,
    "privacy_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountActionToken_token_hash_key" ON "AccountActionToken"("token_hash");
CREATE INDEX "AccountActionToken_user_id_purpose_consumed_at_expires_at_idx" ON "AccountActionToken"("user_id", "purpose", "consumed_at", "expires_at");
CREATE UNIQUE INDEX "LegalAcceptance_user_id_terms_version_privacy_version_key" ON "LegalAcceptance"("user_id", "terms_version", "privacy_version");
CREATE INDEX "LegalAcceptance_user_id_accepted_at_idx" ON "LegalAcceptance"("user_id", "accepted_at");

ALTER TABLE "AccountActionToken" ADD CONSTRAINT "AccountActionToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
