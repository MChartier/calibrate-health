-- Legacy days deliberately retain unknown plan history.
ALTER TABLE "FoodLogDay"
  ADD COLUMN "comparison_target_kcal" INTEGER,
  ADD COLUMN "comparison_maintenance_kcal" INTEGER,
  ADD COLUMN "comparison_captured_at" TIMESTAMP(3);
