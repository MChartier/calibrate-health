package app.calibratehealth.wear.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "daily_snapshots")
data class DailySnapshotEntity(
    @PrimaryKey
    @ColumnInfo(name = "local_date")
    val localDate: String,
    @ColumnInfo(name = "calories_consumed")
    val caloriesConsumed: Int?,
    @ColumnInfo(name = "calorie_target")
    val calorieTarget: Int?,
    val steps: Int?,
    @ColumnInfo(name = "activity_calories")
    val activityCalories: Int?,
    @ColumnInfo(name = "latest_weight_grams")
    val latestWeightGrams: Long?,
    @ColumnInfo(name = "server_revision")
    val serverRevision: String?,
    @ColumnInfo(name = "fetched_at_epoch_ms")
    val fetchedAtEpochMs: Long
)

@Entity(
    tableName = "quick_add_items",
    indices = [Index(value = ["sort_rank", "updated_at_epoch_ms"])]
)
data class QuickAddItemEntity(
    @PrimaryKey
    @ColumnInfo(name = "quick_add_id")
    val quickAddId: String,
    val name: String,
    @ColumnInfo(name = "meal_period")
    val mealPeriod: String?,
    val calories: Int,
    @ColumnInfo(name = "serving_description")
    val servingDescription: String,
    @ColumnInfo(name = "mutation_payload_json")
    val mutationPayloadJson: String,
    @ColumnInfo(name = "sort_rank")
    val sortRank: Int,
    @ColumnInfo(name = "updated_at_epoch_ms")
    val updatedAtEpochMs: Long
)

object MutationState {
    const val PENDING = "pending"
    const val SUCCEEDED = "succeeded"
    const val FAILED = "failed"
}

@Entity(
    tableName = "queued_mutations",
    indices = [
        Index(value = ["operation_id"], unique = true),
        Index(value = ["state", "sequence_id"]),
        Index(value = ["state", "attempt_count"])
    ]
)
data class QueuedMutationEntity(
    // Room assigns this row ID at insertion so clock skew and operation IDs cannot reorder the outbox.
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "sequence_id")
    val sequenceId: Long = 0,
    @ColumnInfo(name = "operation_id")
    val operationId: String,
    @ColumnInfo(name = "mutation_type")
    val mutationType: String,
    @ColumnInfo(name = "payload_json")
    val payloadJson: String,
    @ColumnInfo(name = "created_at_epoch_ms")
    val createdAtEpochMs: Long,
    val state: String = MutationState.PENDING,
    @ColumnInfo(name = "attempt_count")
    val attemptCount: Int = 0,
    @ColumnInfo(name = "last_error")
    val lastError: String? = null
)

@Entity(tableName = "sync_metadata")
data class SyncMetadataEntity(
    @PrimaryKey
    val id: Int = SINGLETON_ID,
    @ColumnInfo(name = "server_origin")
    val serverOrigin: String,
    @ColumnInfo(name = "sync_cursor")
    val syncCursor: String?,
    @ColumnInfo(name = "last_success_at_epoch_ms")
    val lastSuccessAtEpochMs: Long?,
    @ColumnInfo(name = "invalidated_at_epoch_ms")
    val invalidatedAtEpochMs: Long?,
    @ColumnInfo(name = "protocol_version")
    val protocolVersion: Int
) {
    init {
        require(id == SINGLETON_ID) { "Sync metadata must use the singleton row." }
    }

    companion object {
        const val SINGLETON_ID = 1
    }
}

object WearCacheLimits {
    const val DAILY_SNAPSHOTS = 21
    const val QUICK_ADD_ITEMS = 24
    const val TERMINAL_MUTATIONS = 100
}
