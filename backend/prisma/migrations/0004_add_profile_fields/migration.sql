-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activity_level" "ActivityLevel",
ADD COLUMN     "date_of_birth" TIMESTAMP(3),
ADD COLUMN     "height_mm" INTEGER,
ADD COLUMN     "sex" "Sex";
