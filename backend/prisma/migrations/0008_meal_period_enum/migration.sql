-- CreateEnum
CREATE TYPE "MealPeriod" AS ENUM ('BREAKFAST', 'MORNING_SNACK', 'LUNCH', 'AFTERNOON_SNACK', 'DINNER', 'EVENING_SNACK');

-- Normalize legacy meal period strings to the new canonical identifiers before
-- converting the column to an enum.
UPDATE "FoodLog"
SET "meal_period" = CASE lower(btrim("meal_period"))
  WHEN 'breakfast' THEN 'BREAKFAST'
  WHEN 'morning snack' THEN 'MORNING_SNACK'
  WHEN 'morning_snack' THEN 'MORNING_SNACK'
  WHEN 'morning' THEN 'MORNING_SNACK'
  WHEN 'lunch' THEN 'LUNCH'
  WHEN 'afternoon snack' THEN 'AFTERNOON_SNACK'
  WHEN 'afternoon_snack' THEN 'AFTERNOON_SNACK'
  WHEN 'afternoon' THEN 'AFTERNOON_SNACK'
  WHEN 'dinner' THEN 'DINNER'
  WHEN 'evening snack' THEN 'EVENING_SNACK'
  WHEN 'evening_snack' THEN 'EVENING_SNACK'
  WHEN 'evening' THEN 'EVENING_SNACK'
  ELSE "meal_period"
END;

DO $$
DECLARE
  invalid_values text;
BEGIN
  SELECT string_agg(DISTINCT "meal_period", ', ' ORDER BY "meal_period")
  INTO invalid_values
  FROM "FoodLog"
  WHERE "meal_period" NOT IN (
    'BREAKFAST',
    'MORNING_SNACK',
    'LUNCH',
    'AFTERNOON_SNACK',
    'DINNER',
    'EVENING_SNACK'
  );

  IF invalid_values IS NOT NULL THEN
    RAISE EXCEPTION 'FoodLog.meal_period contains unexpected values: %', invalid_values;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "FoodLog" ALTER COLUMN "meal_period" TYPE "MealPeriod" USING ("meal_period"::"MealPeriod");

