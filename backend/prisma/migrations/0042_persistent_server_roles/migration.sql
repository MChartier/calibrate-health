CREATE TYPE "ServerRole" AS ENUM ('admin', 'member');

ALTER TABLE "User" ADD COLUMN "server_role" "ServerRole" NOT NULL DEFAULT 'member';

CREATE TABLE "ServerAccessState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "first_user_bootstrap_available" BOOLEAN NOT NULL DEFAULT false,
    "legacy_admin_imported_at" TIMESTAMP(3),
    CONSTRAINT "ServerAccessState_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ServerAccessState_singleton" CHECK ("id" = 1)
);

-- Only a genuinely empty database can offer first-user ownership. Existing installations
-- import confirmed account ids once at startup or use the operator recovery command.
INSERT INTO "ServerAccessState" ("id", "first_user_bootstrap_available")
SELECT 1, NOT EXISTS (SELECT 1 FROM "User");
