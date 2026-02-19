-- CreateEnum
CREATE TYPE "InAppNotificationType" AS ENUM ('LOG_WEIGHT_REMINDER', 'LOG_FOOD_REMINDER');

-- CreateTable
CREATE TABLE "InAppNotification" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "InAppNotificationType" NOT NULL,
    "local_date" DATE NOT NULL,
    "read_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InAppNotification_user_id_type_local_date_key" ON "InAppNotification"("user_id", "type", "local_date");

-- CreateIndex
CREATE INDEX "InAppNotification_user_id_created_at_idx" ON "InAppNotification"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "InAppNotification_user_id_dismissed_at_resolved_at_idx" ON "InAppNotification"("user_id", "dismissed_at", "resolved_at");

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
