-- CreateEnum
CREATE TYPE "CalibrationRecommendationStatus" AS ENUM ('PENDING', 'APPLIED', 'STALE');

-- CreateTable
CREATE TABLE "CalibrationRecommendation" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "source_goal_id" INTEGER NOT NULL,
    "input_fingerprint" TEXT NOT NULL,
    "model_version" INTEGER NOT NULL,
    "as_of_local_date" DATE NOT NULL,
    "current_target_adjustment_kcal" INTEGER NOT NULL,
    "recommended_target_adjustment_kcal" INTEGER NOT NULL,
    "current_target_kcal" INTEGER NOT NULL,
    "recommended_target_kcal" INTEGER NOT NULL,
    "status" "CalibrationRecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "result_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "CalibrationRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaloriePlanRevision" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "source_goal_id" INTEGER NOT NULL,
    "recommendation_id" INTEGER,
    "target_adjustment_kcal" INTEGER NOT NULL,
    "effective_local_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaloriePlanRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationRecommendation_user_id_input_fingerprint_key" ON "CalibrationRecommendation"("user_id", "input_fingerprint");
CREATE INDEX "CalibrationRecommendation_user_id_status_created_at_idx" ON "CalibrationRecommendation"("user_id", "status", "created_at" DESC);
CREATE UNIQUE INDEX "CaloriePlanRevision_recommendation_id_key" ON "CaloriePlanRevision"("recommendation_id");
CREATE INDEX "CaloriePlanRevision_user_id_source_goal_id_effective_local_date_id_idx" ON "CaloriePlanRevision"("user_id", "source_goal_id", "effective_local_date" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "CalibrationRecommendation" ADD CONSTRAINT "CalibrationRecommendation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalibrationRecommendation" ADD CONSTRAINT "CalibrationRecommendation_source_goal_id_fkey" FOREIGN KEY ("source_goal_id") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaloriePlanRevision" ADD CONSTRAINT "CaloriePlanRevision_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaloriePlanRevision" ADD CONSTRAINT "CaloriePlanRevision_source_goal_id_fkey" FOREIGN KEY ("source_goal_id") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaloriePlanRevision" ADD CONSTRAINT "CaloriePlanRevision_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "CalibrationRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
