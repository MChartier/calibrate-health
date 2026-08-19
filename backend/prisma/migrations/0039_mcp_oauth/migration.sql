-- Remote MCP uses OAuth 2.1 public clients. Only purpose-bound hashes of opaque
-- authorization requests, codes, and bearer credentials are persisted.
CREATE TABLE "McpOAuthClient" (
    "client_id" TEXT NOT NULL,
    "metadata_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("client_id")
);

CREATE TABLE "McpOAuthAuthorizationRequest" (
    "request_hash" VARCHAR(64) NOT NULL,
    "client_id" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "state" TEXT,
    "scopes" TEXT[] NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "McpOAuthAuthorizationRequest_pkey" PRIMARY KEY ("request_hash")
);

CREATE TABLE "McpOAuthAuthorizationCode" (
    "code_hash" VARCHAR(64) NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "McpOAuthAuthorizationCode_pkey" PRIMARY KEY ("code_hash")
);

CREATE TABLE "McpOAuthGrant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "resource" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "McpOAuthGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpOAuthAccessToken" (
    "token_hash" VARCHAR(64) NOT NULL,
    "grant_id" UUID NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "McpOAuthAccessToken_pkey" PRIMARY KEY ("token_hash")
);

CREATE TABLE "McpOAuthRefreshToken" (
    "token_hash" VARCHAR(64) NOT NULL,
    "grant_id" UUID NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    CONSTRAINT "McpOAuthRefreshToken_pkey" PRIMARY KEY ("token_hash")
);

CREATE INDEX "McpOAuthClient_updated_at_idx" ON "McpOAuthClient"("updated_at");
CREATE INDEX "McpOAuthAuthorizationRequest_expires_at_idx" ON "McpOAuthAuthorizationRequest"("expires_at");
CREATE INDEX "McpOAuthAuthorizationRequest_client_id_expires_at_idx" ON "McpOAuthAuthorizationRequest"("client_id", "expires_at");
CREATE INDEX "McpOAuthAuthorizationCode_expires_at_idx" ON "McpOAuthAuthorizationCode"("expires_at");
CREATE INDEX "McpOAuthAuthorizationCode_user_id_expires_at_idx" ON "McpOAuthAuthorizationCode"("user_id", "expires_at");
CREATE INDEX "McpOAuthGrant_user_id_revoked_at_created_at_idx" ON "McpOAuthGrant"("user_id", "revoked_at", "created_at" DESC);
CREATE INDEX "McpOAuthGrant_client_id_revoked_at_idx" ON "McpOAuthGrant"("client_id", "revoked_at");
CREATE INDEX "McpOAuthAccessToken_grant_id_expires_at_idx" ON "McpOAuthAccessToken"("grant_id", "expires_at");
CREATE INDEX "McpOAuthAccessToken_expires_at_idx" ON "McpOAuthAccessToken"("expires_at");
CREATE INDEX "McpOAuthRefreshToken_grant_id_used_at_expires_at_idx" ON "McpOAuthRefreshToken"("grant_id", "used_at", "expires_at");
CREATE INDEX "McpOAuthRefreshToken_expires_at_idx" ON "McpOAuthRefreshToken"("expires_at");

ALTER TABLE "McpOAuthAuthorizationRequest" ADD CONSTRAINT "McpOAuthAuthorizationRequest_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "McpOAuthClient"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpOAuthAuthorizationCode" ADD CONSTRAINT "McpOAuthAuthorizationCode_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "McpOAuthClient"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpOAuthAuthorizationCode" ADD CONSTRAINT "McpOAuthAuthorizationCode_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpOAuthGrant" ADD CONSTRAINT "McpOAuthGrant_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "McpOAuthClient"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpOAuthGrant" ADD CONSTRAINT "McpOAuthGrant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpOAuthAccessToken" ADD CONSTRAINT "McpOAuthAccessToken_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "McpOAuthGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpOAuthRefreshToken" ADD CONSTRAINT "McpOAuthRefreshToken_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "McpOAuthGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
