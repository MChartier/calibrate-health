ALTER TABLE "User" ADD COLUMN "onboarding_completed_at" TIMESTAMP(3);

CREATE TABLE "OnboardingDraft" (
    "user_id" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "current_step" TEXT,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingDraft_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "OnboardingDraft"
    ADD CONSTRAINT "OnboardingDraft_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Legacy clients considered setup complete only after a usable profile, a weight,
-- and a goal existed. Preserve that state without guessing completion for partial accounts.
UPDATE "User" AS u
SET "onboarding_completed_at" = COALESCE(
    (
        SELECT MAX(g."created_at")
        FROM "Goal" AS g
        WHERE g."user_id" = u."id"
    ),
    u."created_at"
)
WHERE u."date_of_birth" IS NOT NULL
  AND u."sex" IS NOT NULL
  AND u."height_mm" IS NOT NULL
  AND u."activity_level" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "BodyMetric" AS m WHERE m."user_id" = u."id")
  AND EXISTS (SELECT 1 FROM "Goal" AS g WHERE g."user_id" = u."id");
