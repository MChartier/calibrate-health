-- CreateEnum
CREATE TYPE "UnitSystem" AS ENUM ('METRIC', 'IMPERIAL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "unit_system" "UnitSystem" NOT NULL DEFAULT 'METRIC';
