-- CreateTable
CREATE TABLE "FoodLogDay" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "local_date" DATE NOT NULL,
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodLogDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodLogDay_user_id_local_date_key" ON "FoodLogDay"("user_id", "local_date");

-- AddForeignKey
ALTER TABLE "FoodLogDay" ADD CONSTRAINT "FoodLogDay_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
