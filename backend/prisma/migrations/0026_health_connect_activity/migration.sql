-- CreateEnum
CREATE TYPE "ActivityRecordType" AS ENUM ('STEPS', 'ACTIVE_CALORIES', 'TOTAL_CALORIES', 'EXERCISE_SESSION', 'WEIGHT');

-- CreateTable
CREATE TABLE "ActivityRecord" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "source_device_id" TEXT NOT NULL,
    "record_type" "ActivityRecordType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "data_origin" TEXT NOT NULL,
    "client_record_id" TEXT,
    "client_record_version" BIGINT,
    "source_updated_at" TIMESTAMP(3) NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "start_zone_offset_seconds" INTEGER,
    "end_zone_offset_seconds" INTEGER,
    "local_date" DATE NOT NULL,
    "step_count" INTEGER,
    "energy_kcal" DOUBLE PRECISION,
    "weight_grams" INTEGER,
    "exercise_type" INTEGER,
    "title" TEXT,
    "notes" TEXT,
    "recording_method" INTEGER,
    "device_type" INTEGER,
    "device_manufacturer" TEXT,
    "device_model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityDaySummary" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "source_device_id" TEXT NOT NULL,
    "local_date" DATE NOT NULL,
    "steps" INTEGER,
    "active_calories_kcal" DOUBLE PRECISION,
    "total_calories_kcal" DOUBLE PRECISION,
    "exercise_minutes" DOUBLE PRECISION,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityDaySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthConnectSyncState" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "source_device_id" TEXT NOT NULL,
    "record_type" "ActivityRecordType" NOT NULL,
    "changes_token" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthConnectSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthConnectTombstone" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "source_device_id" TEXT NOT NULL,
    "record_type" "ActivityRecordType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthConnectTombstone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityRecord_user_id_source_device_id_record_type_external_id_key"
ON "ActivityRecord"("user_id", "source_device_id", "record_type", "external_id");

CREATE INDEX "ActivityRecord_user_id_local_date_start_time_idx"
ON "ActivityRecord"("user_id", "local_date", "start_time");

CREATE INDEX "ActivityRecord_user_id_record_type_data_origin_client_record_id_idx"
ON "ActivityRecord"("user_id", "record_type", "data_origin", "client_record_id");

CREATE UNIQUE INDEX "ActivityDaySummary_user_id_local_date_key"
ON "ActivityDaySummary"("user_id", "local_date");

CREATE UNIQUE INDEX "HealthConnectSyncState_user_id_source_device_id_record_type_key"
ON "HealthConnectSyncState"("user_id", "source_device_id", "record_type");

CREATE INDEX "HealthConnectSyncState_user_id_source_device_id_idx"
ON "HealthConnectSyncState"("user_id", "source_device_id");

CREATE UNIQUE INDEX "HealthConnectTombstone_user_id_source_device_id_record_type_external_id_key"
ON "HealthConnectTombstone"("user_id", "source_device_id", "record_type", "external_id");

CREATE INDEX "HealthConnectTombstone_user_id_deleted_at_idx"
ON "HealthConnectTombstone"("user_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "ActivityRecord" ADD CONSTRAINT "ActivityRecord_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityDaySummary" ADD CONSTRAINT "ActivityDaySummary_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HealthConnectSyncState" ADD CONSTRAINT "HealthConnectSyncState_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HealthConnectTombstone" ADD CONSTRAINT "HealthConnectTombstone_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
