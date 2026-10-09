-- No runtime producer is installed. Existing accounts remain active and local.
ALTER TABLE "User" ADD COLUMN "deletion_pending" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE "AccountDeletion" (
  "operation_id" TEXT PRIMARY KEY,
  "user_id" INTEGER NOT NULL UNIQUE,
  "installation_id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "uid" TEXT NOT NULL,
  "credential_version" INTEGER NOT NULL CHECK ("credential_version" >= 0),
  "state" TEXT NOT NULL DEFAULT 'pending_provider' CHECK ("state" IN ('pending_provider', 'provider_confirmed', 'complete')),
  "claim_generation" INTEGER NOT NULL DEFAULT 0 CHECK ("claim_generation" >= 0),
  "claim_until" TIMESTAMP(3),
  "last_outcome" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  UNIQUE ("project_id", "uid"),
  CHECK (length("operation_id") BETWEEN 16 AND 100),
  CHECK (length("installation_id") BETWEEN 3 AND 100 AND length("source_id") BETWEEN 3 AND 100
    AND length("project_id") BETWEEN 3 AND 100 AND length("uid") BETWEEN 1 AND 128),
  CHECK (("state" = 'complete') = ("completed_at" IS NOT NULL))
);
CREATE INDEX "AccountDeletion_state_claim_until_idx" ON "AccountDeletion"("state", "claim_until");

CREATE FUNCTION "calibrate_deletion_receipt_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Deletion receipts cannot be removed'; END IF;
  IF ROW(NEW."operation_id", NEW."user_id", NEW."installation_id", NEW."source_id", NEW."project_id", NEW."uid", NEW."credential_version", NEW."created_at")
    IS DISTINCT FROM ROW(OLD."operation_id", OLD."user_id", OLD."installation_id", OLD."source_id", OLD."project_id", OLD."uid", OLD."credential_version", OLD."created_at")
    OR NEW."claim_generation" < OLD."claim_generation"
    OR (OLD."state" = 'provider_confirmed' AND NEW."state" = 'pending_provider')
    OR (OLD."state" = 'complete' AND NEW IS DISTINCT FROM OLD)
    OR (OLD."state" = 'pending_provider' AND NEW."state" = 'complete') THEN
    RAISE EXCEPTION 'Deletion receipt cannot change identity or rewind';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AccountDeletion_guard" BEFORE UPDATE OR DELETE ON "AccountDeletion"
  FOR EACH ROW EXECUTE FUNCTION "calibrate_deletion_receipt_guard"();

CREATE FUNCTION "calibrate_pending_deletion_guard"() RETURNS trigger AS $$
DECLARE allowed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I."AccountDeletion" WHERE user_id = $1)', TG_TABLE_SCHEMA)
      INTO allowed USING NEW.id;
    IF allowed OR NEW.deletion_pending THEN RAISE EXCEPTION 'Deleted account identity cannot be recreated'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.deletion_pending THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I."AccountDeletion" WHERE user_id = $1 AND state = ''complete'')', TG_TABLE_SCHEMA)
        INTO allowed USING OLD.id;
      IF NOT allowed THEN RAISE EXCEPTION 'Account deletion is pending'; END IF;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.deletion_pending THEN RAISE EXCEPTION 'Account deletion is pending'; END IF;
  IF NEW.deletion_pending THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I."AccountDeletion" d JOIN %I."FirebaseIdentity" f ON f.user_id = d.user_id WHERE d.user_id = $1 AND d.credential_version = $2 AND d.state = ''pending_provider'' AND (d.installation_id,d.source_id,d.project_id,d.uid) = (f.installation_id,f.source_id,f.project_id,f.uid))', TG_TABLE_SCHEMA, TG_TABLE_SCHEMA)
      INTO allowed USING OLD.id, OLD.credential_security_version;
    IF NOT allowed OR NEW.credential_security_version <> OLD.credential_security_version + 1 THEN
      RAISE EXCEPTION 'Deletion requires a bound durable intent';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "User_deletion_guard" BEFORE INSERT OR UPDATE OR DELETE ON "User"
  FOR EACH ROW EXECUTE FUNCTION "calibrate_pending_deletion_guard"();

-- Lock only mapped accounts. Ordinary unmapped local-account writers keep their existing ordering.
-- For mapped accounts, PostgreSQL may abort a conflicting older writer; it must retry, never bypass the fence.
CREATE FUNCTION "calibrate_deletion_access_guard"() RETURNS trigger AS $$
DECLARE owner_id INTEGER; pending BOOLEAN;
BEGIN
  IF TG_TABLE_NAME IN ('McpOAuthAccessToken', 'McpOAuthRefreshToken') THEN
    EXECUTE format('SELECT user_id FROM %I."McpOAuthGrant" WHERE id = $1', TG_TABLE_SCHEMA)
      INTO owner_id USING NEW.grant_id;
  ELSE owner_id := NEW.user_id;
  END IF;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT u.deletion_pending FROM %I."User" u WHERE u.id = $1 AND (u.deletion_pending OR EXISTS (SELECT 1 FROM %I."FirebaseIdentity" f WHERE f.user_id = u.id)) FOR UPDATE OF u', TG_TABLE_SCHEMA, TG_TABLE_SCHEMA)
    INTO pending USING owner_id;
  IF pending THEN RAISE EXCEPTION 'Account deletion is pending'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$
DECLARE target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['session_store','MobileAuthSession','AccountActionToken','McpOAuthGrant','McpOAuthAuthorizationCode','McpOAuthAccessToken','McpOAuthRefreshToken','WearPairingCredential','PushSubscription','NativePushSubscription'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION "calibrate_deletion_access_guard"()', target || '_deletion_guard', target);
  END LOOP;
END;
$$;

CREATE FUNCTION "calibrate_deleted_identity_guard"() RETURNS trigger AS $$
DECLARE retired BOOLEAN;
BEGIN
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I."AccountDeletion" WHERE user_id = $1 OR (project_id = $2 AND uid = $3))', TG_TABLE_SCHEMA)
    INTO retired USING NEW.user_id, NEW.project_id, NEW.uid;
  IF retired THEN RAISE EXCEPTION 'Deletion identity is reserved'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "FirebaseIdentity_deletion_guard" BEFORE INSERT ON "FirebaseIdentity"
  FOR EACH ROW EXECUTE FUNCTION "calibrate_deleted_identity_guard"();

-- The receipt and account transition must commit together, including when finalization fails.
CREATE FUNCTION "calibrate_deletion_consistency"() RETURNS trigger AS $$
DECLARE valid BOOLEAN;
BEGIN
  EXECUTE format('SELECT CASE WHEN d.state = ''complete'' THEN NOT EXISTS (SELECT 1 FROM %I."User" u WHERE u.id = d.user_id) ELSE EXISTS (SELECT 1 FROM %I."User" u JOIN %I."FirebaseIdentity" f ON f.user_id = u.id WHERE u.id = d.user_id AND u.deletion_pending AND u.credential_security_version = d.credential_version + 1 AND (f.installation_id,f.source_id,f.project_id,f.uid) = (d.installation_id,d.source_id,d.project_id,d.uid)) END FROM %I."AccountDeletion" d WHERE d.operation_id = $1', TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA)
    INTO valid USING NEW.operation_id;
  IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Deletion receipt and account must commit together'; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "AccountDeletion_consistent" AFTER INSERT OR UPDATE ON "AccountDeletion"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "calibrate_deletion_consistency"();
