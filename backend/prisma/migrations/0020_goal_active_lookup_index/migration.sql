-- Align latest-goal lookups with append-only goal history.
-- 0019 already creates this index in current fresh installs; keep this migration
-- idempotent for databases whose earlier migration history predates that addition.
CREATE INDEX IF NOT EXISTS "Goal_user_id_created_at_id_idx"
  ON "Goal"("user_id", "created_at" DESC, "id" DESC);
