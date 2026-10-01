CREATE TABLE "ServerSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nutrition_label_scanning_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServerSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ServerSettings_singleton" CHECK ("id" = 1)
);
