-- CreateTable
CREATE TABLE "session_store" (
    "sid" TEXT NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "session_store_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX "session_store_expire_idx" ON "session_store"("expire");

