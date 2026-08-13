-- Support keyset pagination by the user-visible pinned/name/id total order.
CREATE INDEX "MyFood_user_id_is_pinned_normalized_name_id_idx"
ON "MyFood"("user_id", "is_pinned" DESC, (LOWER("name")), "id");
