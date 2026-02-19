-- Add an account-level haptics preference so users can disable vibration feedback globally.
ALTER TABLE "User"
ADD COLUMN "haptics_enabled" BOOLEAN NOT NULL DEFAULT true;
