ALTER TABLE "MyFood"
ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "MyFood_user_id_is_pinned_name_id_idx"
ON "MyFood"("user_id", "is_pinned" DESC, "name", "id");
