-- Collapse duplicate endpoint rows created by per-user uniqueness so endpoint ownership can be global again.
WITH ranked_subscriptions AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY endpoint
            ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS row_rank
    FROM "PushSubscription"
)
DELETE FROM "PushSubscription" AS ps
USING ranked_subscriptions AS ranked
WHERE ps.id = ranked.id
  AND ranked.row_rank > 1;

-- Restore global endpoint uniqueness so pushes cannot fan out across multiple accounts on a shared browser.
DROP INDEX "PushSubscription_user_id_endpoint_key";
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
