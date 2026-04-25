ALTER TABLE "FoodLog"
ADD COLUMN "external_source" TEXT,
ADD COLUMN "external_id" TEXT,
ADD COLUMN "brand_snapshot" TEXT,
ADD COLUMN "locale_snapshot" TEXT,
ADD COLUMN "barcode_snapshot" TEXT,
ADD COLUMN "measure_label_snapshot" TEXT,
ADD COLUMN "grams_per_measure_snapshot" DOUBLE PRECISION,
ADD COLUMN "measure_quantity_snapshot" DOUBLE PRECISION,
ADD COLUMN "grams_total_snapshot" DOUBLE PRECISION;
