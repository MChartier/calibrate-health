-- CreateEnum
CREATE TYPE "HeightUnit" AS ENUM ('CM', 'FT_IN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "height_unit" "HeightUnit" NOT NULL DEFAULT 'CM';

-- Backfill a sensible default for existing users based on their persisted weight unit.
UPDATE "User" SET "height_unit" = 'FT_IN' WHERE "weight_unit" = 'LB';

