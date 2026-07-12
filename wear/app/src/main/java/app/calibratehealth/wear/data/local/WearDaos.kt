package app.calibratehealth.wear.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
abstract class DailySnapshotDao {
    @Query("SELECT * FROM daily_snapshots ORDER BY local_date DESC LIMIT 1")
    abstract fun observeLatest(): Flow<DailySnapshotEntity?>

    @Query("SELECT * FROM daily_snapshots ORDER BY local_date DESC")
    abstract suspend fun allNewestFirst(): List<DailySnapshotEntity>

    @Upsert
    protected abstract suspend fun upsert(snapshot: DailySnapshotEntity)

    @Query(
        """
        DELETE FROM daily_snapshots
        WHERE local_date NOT IN (
            SELECT local_date FROM daily_snapshots ORDER BY local_date DESC LIMIT :maxRows
        )
        """
    )
    protected abstract suspend fun prune(maxRows: Int)

    @Query("DELETE FROM daily_snapshots")
    abstract suspend fun clearAll()

    @Transaction
    open suspend fun cacheBounded(snapshot: DailySnapshotEntity, maxRows: Int) {
        require(maxRows > 0) { "Snapshot cache bound must be positive." }
        upsert(snapshot)
        prune(maxRows)
    }
}

@Dao
abstract class QuickAddItemDao {
    @Query("SELECT * FROM quick_add_items ORDER BY sort_rank ASC, updated_at_epoch_ms DESC, quick_add_id ASC")
    abstract fun observeAll(): Flow<List<QuickAddItemEntity>>

    @Query("SELECT * FROM quick_add_items ORDER BY sort_rank ASC, updated_at_epoch_ms DESC, quick_add_id ASC")
    abstract suspend fun all(): List<QuickAddItemEntity>

    @Upsert
    protected abstract suspend fun upsertAll(items: List<QuickAddItemEntity>)

    @Query("DELETE FROM quick_add_items")
    abstract suspend fun clearAll()

    @Query(
        """
        DELETE FROM quick_add_items
        WHERE quick_add_id NOT IN (
            SELECT quick_add_id FROM quick_add_items
            ORDER BY sort_rank ASC, updated_at_epoch_ms DESC, quick_add_id ASC
            LIMIT :maxRows
        )
        """
    )
    protected abstract suspend fun prune(maxRows: Int)

    @Transaction
    open suspend fun cacheBounded(items: List<QuickAddItemEntity>, maxRows: Int) {
        require(maxRows > 0) { "Quick-add cache bound must be positive." }
        clearAll()
        upsertAll(items)
        prune(maxRows)
    }
}

@Dao
interface QueuedMutationDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(mutation: QueuedMutationEntity): Long

    @Query(
        """
        SELECT * FROM queued_mutations
        WHERE state = 'pending'
        ORDER BY sequence_id ASC
        LIMIT 1
        """
    )
    suspend fun head(): QueuedMutationEntity?

    @Query(
        """
        SELECT * FROM queued_mutations
        WHERE state = 'pending'
        ORDER BY sequence_id ASC
        """
    )
    suspend fun pendingInFifoOrder(): List<QueuedMutationEntity>

    @Query(
        """
        UPDATE queued_mutations
        SET attempt_count = attempt_count + 1,
            last_error = :error
        WHERE operation_id = :operationId AND state = 'pending'
        """
    )
    suspend fun markRetry(operationId: String, error: String): Int

    @Query(
        """
        UPDATE queued_mutations
        SET state = 'succeeded', last_error = NULL
        WHERE operation_id = :operationId AND state = 'pending'
        """
    )
    suspend fun markSucceeded(operationId: String): Int

    @Query(
        """
        UPDATE queued_mutations
        SET state = 'failed', last_error = :error
        WHERE operation_id = :operationId AND state = 'pending'
        """
    )
    suspend fun markFailed(operationId: String, error: String): Int

    @Query(
        """
        DELETE FROM queued_mutations
        WHERE state IN ('succeeded', 'failed') AND operation_id NOT IN (
            SELECT operation_id FROM queued_mutations
            WHERE state IN ('succeeded', 'failed')
            ORDER BY sequence_id DESC
            LIMIT :maxRows
        )
        """
    )
    suspend fun pruneTerminal(maxRows: Int)

    @Query("DELETE FROM queued_mutations")
    suspend fun clearAll()
}

@Dao
interface SyncMetadataDao {
    @Query("SELECT * FROM sync_metadata WHERE id = 1")
    fun observe(): Flow<SyncMetadataEntity?>

    @Query("SELECT * FROM sync_metadata WHERE id = 1")
    suspend fun get(): SyncMetadataEntity?

    @Upsert
    suspend fun upsert(metadata: SyncMetadataEntity)

    @Query("DELETE FROM sync_metadata")
    suspend fun clear()
}
