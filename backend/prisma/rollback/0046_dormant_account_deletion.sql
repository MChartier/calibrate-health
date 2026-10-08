-- Explicit preparation rollback only. Never discard an accepted operation, even a completed receipt.
-- Run against the same database/schema; restoring an older backup is not a lifecycle rollback.
BEGIN;
LOCK TABLE "User", "AccountDeletion" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "AccountDeletion") OR EXISTS (SELECT 1 FROM "User" WHERE deletion_pending) THEN
    RAISE EXCEPTION 'Refusing rollback: retain deletion operations and use a compatible application';
  END IF;
END $$;
DROP TRIGGER "User_deletion_guard" ON "User";
DROP TRIGGER "FirebaseIdentity_deletion_guard" ON "FirebaseIdentity";
DO $$ DECLARE target TEXT; BEGIN
  FOREACH target IN ARRAY ARRAY['session_store','MobileAuthSession','AccountActionToken','McpOAuthGrant','McpOAuthAuthorizationCode','McpOAuthAccessToken','McpOAuthRefreshToken','WearPairingCredential','PushSubscription','NativePushSubscription'] LOOP
    EXECUTE format('DROP TRIGGER %I ON %I', target || '_deletion_guard', target);
  END LOOP;
END $$;
DROP TABLE "AccountDeletion";
ALTER TABLE "User" DROP COLUMN "deletion_pending";
DROP FUNCTION "calibrate_deletion_consistency"();
DROP FUNCTION "calibrate_deleted_identity_guard"();
DROP FUNCTION "calibrate_deletion_access_guard"();
DROP FUNCTION "calibrate_pending_deletion_guard"();
DROP FUNCTION "calibrate_deletion_receipt_guard"();
COMMIT;
