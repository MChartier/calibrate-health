package app.calibratehealth.wear.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        DailySnapshotEntity::class,
        QuickAddItemEntity::class,
        QueuedMutationEntity::class,
        SyncMetadataEntity::class
    ],
    version = 3,
    exportSchema = true
)
abstract class CalibrateWearDatabase : RoomDatabase() {
    abstract fun dailySnapshotDao(): DailySnapshotDao
    abstract fun quickAddItemDao(): QuickAddItemDao
    abstract fun queuedMutationDao(): QueuedMutationDao
    abstract fun syncMetadataDao(): SyncMetadataDao

    companion object {
        const val DATABASE_NAME = "calibrate-wear.db"

        @Volatile
        private var instance: CalibrateWearDatabase? = null

        fun get(context: Context): CalibrateWearDatabase = instance ?: synchronized(this) {
            instance ?: open(context).also { instance = it }
        }

        fun open(context: Context, name: String = DATABASE_NAME): CalibrateWearDatabase =
            Room.databaseBuilder(
                context.applicationContext,
                CalibrateWearDatabase::class.java,
                name
            )
                .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                .build()

        /** Preserves the old outbox order while moving FIFO authority to a database-assigned row ID. */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE queued_mutations RENAME TO queued_mutations_v1")
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS queued_mutations (
                        sequence_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        operation_id TEXT NOT NULL,
                        mutation_type TEXT NOT NULL,
                        payload_json TEXT NOT NULL,
                        created_at_epoch_ms INTEGER NOT NULL,
                        state TEXT NOT NULL,
                        attempt_count INTEGER NOT NULL,
                        last_error TEXT
                    )
                    """.trimIndent()
                )
                database.execSQL(
                    """
                    INSERT INTO queued_mutations (
                        operation_id, mutation_type, payload_json, created_at_epoch_ms,
                        state, attempt_count, last_error
                    )
                    SELECT operation_id, mutation_type, payload_json, created_at_epoch_ms,
                        state, attempt_count, last_error
                    FROM queued_mutations_v1
                    ORDER BY created_at_epoch_ms ASC, operation_id ASC
                    """.trimIndent()
                )
                database.execSQL("DROP TABLE queued_mutations_v1")
                database.execSQL(
                    "CREATE UNIQUE INDEX IF NOT EXISTS index_queued_mutations_operation_id " +
                        "ON queued_mutations (operation_id)"
                )
                database.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_queued_mutations_state_sequence_id " +
                        "ON queued_mutations (state, sequence_id)"
                )
                database.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_queued_mutations_state_attempt_count " +
                        "ON queued_mutations (state, attempt_count)"
                )
            }
        }

        /** Expands the cached daily row without inventing activity, weight, or undo data for v2 caches. */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN calories_remaining INTEGER")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN activity_total_calories INTEGER")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN exercise_minutes INTEGER")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN activity_observed_at_epoch_ms INTEGER")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN activity_stale INTEGER NOT NULL DEFAULT 1")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN activity_age_seconds INTEGER")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN food_day_complete INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN food_day_completed_at_epoch_ms INTEGER")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN food_day_revision TEXT")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN today_weight_grams INTEGER")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN today_weight_revision TEXT")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN latest_weight_revision TEXT")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN latest_weight_date TEXT")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN weight_unit TEXT NOT NULL DEFAULT 'KG'")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN undo_food_log_id INTEGER")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN undo_name TEXT")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN undo_calories INTEGER")
                database.execSQL("ALTER TABLE daily_snapshots ADD COLUMN undo_created_at_epoch_ms INTEGER")
            }
        }
    }
}
