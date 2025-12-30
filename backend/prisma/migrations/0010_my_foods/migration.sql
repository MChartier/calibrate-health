-- CreateEnum
CREATE TYPE "MyFoodType" AS ENUM ('FOOD', 'RECIPE');

-- CreateEnum
CREATE TYPE "RecipeIngredientSource" AS ENUM ('MY_FOOD', 'EXTERNAL');

-- CreateTable
CREATE TABLE "MyFood" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "MyFoodType" NOT NULL,
    "name" TEXT NOT NULL,
    "serving_size_quantity" DOUBLE PRECISION NOT NULL,
    "serving_unit_label" TEXT NOT NULL,
    "calories_per_serving" DOUBLE PRECISION NOT NULL,
    "recipe_total_calories" DOUBLE PRECISION,
    "yield_servings" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MyFood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" SERIAL NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source" "RecipeIngredientSource" NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "calories_total_snapshot" DOUBLE PRECISION NOT NULL,

    "source_my_food_id" INTEGER,
    "quantity_servings" DOUBLE PRECISION,
    "serving_size_quantity_snapshot" DOUBLE PRECISION,
    "serving_unit_label_snapshot" TEXT,
    "calories_per_serving_snapshot" DOUBLE PRECISION,

    "external_source" TEXT,
    "external_id" TEXT,
    "brand_snapshot" TEXT,
    "locale_snapshot" TEXT,
    "barcode_snapshot" TEXT,
    "measure_label_snapshot" TEXT,
    "grams_per_measure_snapshot" DOUBLE PRECISION,
    "measure_quantity_snapshot" DOUBLE PRECISION,
    "grams_total_snapshot" DOUBLE PRECISION,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "FoodLog"
ADD COLUMN "my_food_id" INTEGER,
ADD COLUMN "servings_consumed" DOUBLE PRECISION,
ADD COLUMN "serving_size_quantity_snapshot" DOUBLE PRECISION,
ADD COLUMN "serving_unit_label_snapshot" TEXT,
ADD COLUMN "calories_per_serving_snapshot" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "MyFood_user_id_name_idx" ON "MyFood"("user_id", "name");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipe_id_idx" ON "RecipeIngredient"("recipe_id");

-- AddForeignKey
ALTER TABLE "MyFood" ADD CONSTRAINT "MyFood_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "MyFood"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_source_my_food_id_fkey" FOREIGN KEY ("source_my_food_id") REFERENCES "MyFood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodLog" ADD CONSTRAINT "FoodLog_my_food_id_fkey" FOREIGN KEY ("my_food_id") REFERENCES "MyFood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

