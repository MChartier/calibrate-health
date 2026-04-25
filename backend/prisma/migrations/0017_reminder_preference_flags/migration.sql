-- Add account-level reminder preference flags so users can opt in/out per reminder type.
ALTER TABLE "User"
ADD COLUMN "reminder_log_weight_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "reminder_log_food_enabled" BOOLEAN NOT NULL DEFAULT true;
