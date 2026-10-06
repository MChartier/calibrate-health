-- Additive preparation only. No account links or credential-authority changes are created.
ALTER TABLE "User" ADD COLUMN "credential_security_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_credential_security_version_nonnegative"
  CHECK ("credential_security_version" >= 0);

CREATE TABLE "FirebaseIdentity" (
  "user_id" INTEGER PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "installation_id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "uid" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FirebaseIdentity_scope_nonempty" CHECK (
    length("installation_id") BETWEEN 3 AND 100 AND
    length("source_id") BETWEEN 3 AND 100 AND
    length("project_id") BETWEEN 3 AND 100 AND
    length("uid") BETWEEN 1 AND 128
  )
);
CREATE UNIQUE INDEX "FirebaseIdentity_project_id_uid_key" ON "FirebaseIdentity"("project_id", "uid");

CREATE FUNCTION "calibrate_immutable_firebase_identity"() RETURNS trigger AS $$
DECLARE account_exists BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I."User" WHERE "id" = $1)', TG_TABLE_SCHEMA)
      INTO account_exists USING OLD."user_id";
    IF account_exists THEN
      RAISE EXCEPTION 'Firebase identity mapping cannot be removed from a live account';
    END IF;
    RETURN OLD;
  END IF;
  IF ROW(NEW."user_id", NEW."installation_id", NEW."source_id", NEW."project_id", NEW."uid", NEW."created_at")
      IS DISTINCT FROM
     ROW(OLD."user_id", OLD."installation_id", OLD."source_id", OLD."project_id", OLD."uid", OLD."created_at") THEN
    RAISE EXCEPTION 'Firebase identity mapping is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "FirebaseIdentity_immutable" BEFORE UPDATE OR DELETE ON "FirebaseIdentity"
  FOR EACH ROW EXECUTE FUNCTION "calibrate_immutable_firebase_identity"();

-- Cover existing/older application writers too; they do not know about this new column.
CREATE FUNCTION "calibrate_credential_security_version"() RETURNS trigger AS $$
BEGIN
  IF NEW."credential_security_version" < OLD."credential_security_version" THEN
    RAISE EXCEPTION 'Credential security version cannot decrease';
  END IF;
  IF NEW."password_hash" IS DISTINCT FROM OLD."password_hash" THEN
    NEW."credential_security_version" := GREATEST(
      NEW."credential_security_version", OLD."credential_security_version" + 1
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "User_credential_security_version" BEFORE UPDATE ON "User"
  FOR EACH ROW EXECUTE FUNCTION "calibrate_credential_security_version"();
