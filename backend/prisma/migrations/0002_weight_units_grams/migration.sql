-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('KG', 'LB');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "weight_unit" "WeightUnit" NOT NULL DEFAULT 'KG';

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "start_weight_grams" INTEGER;
ALTER TABLE "Goal" ADD COLUMN "target_weight_grams" INTEGER;

UPDATE "Goal" SET "start_weight_grams" = ROUND("start_weight" * 1000)::INTEGER;
UPDATE "Goal" SET "target_weight_grams" = ROUND("target_weight" * 1000)::INTEGER;

ALTER TABLE "Goal" ALTER COLUMN "start_weight_grams" SET NOT NULL;
ALTER TABLE "Goal" ALTER COLUMN "target_weight_grams" SET NOT NULL;

ALTER TABLE "Goal" DROP COLUMN "start_weight";
ALTER TABLE "Goal" DROP COLUMN "target_weight";

-- AlterTable
ALTER TABLE "BodyMetric" ADD COLUMN "weight_grams" INTEGER;

UPDATE "BodyMetric" SET "weight_grams" = ROUND("weight" * 1000)::INTEGER;

ALTER TABLE "BodyMetric" ALTER COLUMN "weight_grams" SET NOT NULL;

ALTER TABLE "BodyMetric" DROP COLUMN "weight";

