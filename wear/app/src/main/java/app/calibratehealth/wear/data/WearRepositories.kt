package app.calibratehealth.wear.data

import app.calibratehealth.wear.data.local.DailySnapshotDao
import app.calibratehealth.wear.data.local.DailySnapshotEntity
import app.calibratehealth.wear.data.local.MutationState
import app.calibratehealth.wear.data.local.QueuedMutationDao
import app.calibratehealth.wear.data.local.QueuedMutationEntity
import app.calibratehealth.wear.data.local.QuickAddItemDao
import app.calibratehealth.wear.data.local.QuickAddItemEntity
import app.calibratehealth.wear.data.local.SyncMetadataDao
import app.calibratehealth.wear.data.local.SyncMetadataEntity
import app.calibratehealth.wear.data.local.WearCacheLimits
import app.calibratehealth.wear.sync.OutboxScheduler
import kotlinx.coroutines.flow.Flow

interface DailySnapshotRepository {
    fun observeLatest(): Flow<DailySnapshotEntity?>
    suspend fun allNewestFirst(): List<DailySnapshotEntity>
    suspend fun cache(snapshot: DailySnapshotEntity)
}

interface QuickAddRepository {
    fun observeAll(): Flow<List<QuickAddItemEntity>>
    suspend fun all(): List<QuickAddItemEntity>
    suspend fun cache(items: List<QuickAddItemEntity>)
}

interface MutationOutboxRepository {
    suspend fun enqueue(mutation: QueuedMutationEntity): Boolean
    suspend fun head(): QueuedMutationEntity?
    suspend fun pendingInFifoOrder(): List<QueuedMutationEntity>
    suspend fun activeInFifoOrder(): List<QueuedMutationEntity>
    suspend fun latestTerminal(): QueuedMutationEntity?
    suspend fun recordRetry(operationId: String, error: String): Boolean
    suspend fun recordServerSuccess(operationId: String): Boolean
    suspend fun confirmSnapshotRefresh()
    suspend fun recordFailure(operationId: String, error: String): Boolean
}

interface SyncMetadataRepository {
    fun observe(): Flow<SyncMetadataEntity?>
    suspend fun get(): SyncMetadataEntity?
    suspend fun store(metadata: SyncMetadataEntity)
    suspend fun clear()
}

class RoomDailySnapshotRepository(
    private val dao: DailySnapshotDao,
    private val maxRows: Int = WearCacheLimits.DAILY_SNAPSHOTS
) : DailySnapshotRepository {
    override fun observeLatest(): Flow<DailySnapshotEntity?> = dao.observeLatest()
    override suspend fun allNewestFirst(): List<DailySnapshotEntity> = dao.allNewestFirst()
    override suspend fun cache(snapshot: DailySnapshotEntity) = dao.cacheBounded(snapshot, maxRows)
}

class RoomQuickAddRepository(
    private val dao: QuickAddItemDao,
    private val maxRows: Int = WearCacheLimits.QUICK_ADD_ITEMS
) : QuickAddRepository {
    override fun observeAll(): Flow<List<QuickAddItemEntity>> = dao.observeAll()
    override suspend fun all(): List<QuickAddItemEntity> = dao.all()
    override suspend fun cache(items: List<QuickAddItemEntity>) = dao.cacheBounded(items, maxRows)
}

class RoomMutationOutboxRepository(
    private val dao: QueuedMutationDao,
    private val scheduler: OutboxScheduler,
    private val terminalMutationLimit: Int = WearCacheLimits.TERMINAL_MUTATIONS
) : MutationOutboxRepository {
    init {
        require(terminalMutationLimit > 0) { "Terminal mutation bound must be positive." }
    }

    override suspend fun enqueue(mutation: QueuedMutationEntity): Boolean {
        require(mutation.state == MutationState.PENDING) { "New mutations must be pending." }
        require(mutation.sequenceId == 0L) { "New mutations must let Room assign FIFO sequence." }
        val inserted = dao.insert(mutation) != -1L
        if (inserted) scheduler.schedule()
        return inserted
    }

    override suspend fun head(): QueuedMutationEntity? = dao.head()
    override suspend fun pendingInFifoOrder(): List<QueuedMutationEntity> = dao.pendingInFifoOrder()
    override suspend fun activeInFifoOrder(): List<QueuedMutationEntity> = dao.activeInFifoOrder()
    override suspend fun latestTerminal(): QueuedMutationEntity? = dao.latestTerminal()

    override suspend fun recordRetry(
        operationId: String,
        error: String
    ): Boolean = dao.markRetry(operationId, error) == 1

    override suspend fun recordServerSuccess(operationId: String): Boolean =
        dao.markServerSucceeded(operationId) == 1

    override suspend fun confirmSnapshotRefresh() {
        if (dao.confirmSnapshotRefresh() > 0) dao.pruneTerminal(terminalMutationLimit)
    }

    override suspend fun recordFailure(operationId: String, error: String): Boolean {
        val updated = dao.markFailed(operationId, error) == 1
        if (updated) dao.pruneTerminal(terminalMutationLimit)
        return updated
    }
}

class RoomSyncMetadataRepository(private val dao: SyncMetadataDao) : SyncMetadataRepository {
    override fun observe(): Flow<SyncMetadataEntity?> = dao.observe()
    override suspend fun get(): SyncMetadataEntity? = dao.get()
    override suspend fun store(metadata: SyncMetadataEntity) = dao.upsert(metadata)
    override suspend fun clear() = dao.clear()
}
