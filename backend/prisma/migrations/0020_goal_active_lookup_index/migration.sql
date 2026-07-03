-- Align latest-goal lookups with append-only goal history.
CREATE INDEX "Goal_user_id_created_at_id_idx" ON "Goal"("user_id", "created_at" DESC, "id" DESC);
