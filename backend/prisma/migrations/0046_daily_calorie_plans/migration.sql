-- Prospective evidence only. Legacy food days and their comparisons remain untouched.
CREATE TABLE "DailyCaloriePlan" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "local_date" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "calculation_version" INTEGER NOT NULL,
    "target_kcal" INTEGER,
    "maintenance_kcal" INTEGER,
    "inputs" JSONB NOT NULL,
    "timezone_conflict" BOOLEAN NOT NULL DEFAULT false,
    "consumed_at" TIMESTAMP(3),
    CONSTRAINT "DailyCaloriePlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DailyCaloriePlan_values_check" CHECK (
      ("target_kcal" IS NULL AND "maintenance_kcal" IS NULL) OR
      ("target_kcal" IS NOT NULL AND "maintenance_kcal" IS NOT NULL AND "target_kcal" > 0 AND "maintenance_kcal" > 0)
    )
);
CREATE UNIQUE INDEX "DailyCaloriePlan_user_id_local_date_key" ON "DailyCaloriePlan"("user_id", "local_date");
ALTER TABLE "DailyCaloriePlan" ADD CONSTRAINT "DailyCaloriePlan_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
