package app.calibratehealth.wear.sync

import android.content.Context
import android.os.SystemClock
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import app.calibratehealth.wear.BuildConfig
import app.calibratehealth.wear.data.MutationOutboxRepository
import app.calibratehealth.wear.data.local.QueuedMutationEntity
import app.calibratehealth.wear.data.security.AccountStateCriticalSection
import app.calibratehealth.wear.data.security.SecureSession
import app.calibratehealth.wear.data.security.SecureTokenStore
import app.calibratehealth.wear.data.security.accountScope
import app.calibratehealth.wear.notifications.WearReminderNotifier
import app.calibratehealth.wear.tile.CalibrateTileUpdate
import java.util.UUID
import java.util.concurrent.TimeUnit

fun interface OperationIdFactory {
    fun create(): String
}

object UuidOperationIdFactory : OperationIdFactory {
    override fun create(): String = UUID.randomUUID().toString()
}

class QueuedMutationFactory(
    private val operationIds: OperationIdFactory = UuidOperationIdFactory,
    private val nowEpochMs: () -> Long = System::currentTimeMillis
) {
    fun create(mutationType: String, payloadJson: String): QueuedMutationEntity =
        QueuedMutationEntity(
            operationId = operationIds.create(),
            mutationType = mutationType,
            payloadJson = payloadJson,
            createdAtEpochMs = nowEpochMs()
        )
}

object OutboxRetryPolicy {
    const val INITIAL_BACKOFF_MS = 10_000L
}

sealed interface MutationSendResult {
    data object Success : MutationSendResult
    data class Retryable(val error: String) : MutationSendResult
    data class UpgradeRequired(val error: String) : MutationSendResult
    data class PermanentFailure(val error: String) : MutationSendResult
    data class Conflict(val error: String) : MutationSendResult
    data object AccountChanged : MutationSendResult
}

fun interface MutationSender {
    suspend fun send(mutation: QueuedMutationEntity, session: SecureSession): MutationSendResult
}

sealed interface OutboxDrainResult {
    data object Complete : OutboxDrainResult
    data object Continue : OutboxDrainResult
    data object Retry : OutboxDrainResult
    data object AccountChanged : OutboxDrainResult
}

fun interface OutboxProcessor {
    suspend fun drain(): OutboxDrainResult
}

class FifoOutboxProcessor(
    private val repository: MutationOutboxRepository,
    private val sender: MutationSender,
    private val tokenStore: SecureTokenStore,
    private val accountState: AccountStateCriticalSection = AccountStateCriticalSection.Shared,
    private val onAuthenticationRequired: (String) -> Unit = {},
    private val onUpgradeRequired: (String) -> Unit = {},
    private val maxMutationsPerRun: Int = 25
) : OutboxProcessor {
    init {
        require(maxMutationsPerRun > 0) { "Outbox batch limit must be positive." }
    }

    override suspend fun drain(): OutboxDrainResult {
        repeat(maxMutationsPerRun) {
            val captured = accountState.withLock {
                val head = repository.head() ?: return@withLock CapturedOutboxWork.Empty
                val session = runCatching { tokenStore.read() }.getOrNull()
                    ?: return@withLock CapturedOutboxWork.NoSession
                CapturedOutboxWork.Work(head, session)
            }
            val work = when (captured) {
                CapturedOutboxWork.Empty -> return OutboxDrainResult.Complete
                CapturedOutboxWork.NoSession -> {
                    onAuthenticationRequired("Pair the watch before syncing queued changes.")
                    return OutboxDrainResult.Retry
                }
                is CapturedOutboxWork.Work -> captured
            }

            val result = sender.send(work.mutation, work.session)
            if (result == MutationSendResult.AccountChanged) return OutboxDrainResult.AccountChanged
            val commit = accountState.withLock {
                val current = runCatching { tokenStore.read() }.getOrNull()
                if (current?.accountScope() != work.session.accountScope()) {
                    return@withLock OutboxCommit.AccountChanged
                }
                val updated = when (result) {
                    MutationSendResult.Success -> repository.recordServerSuccess(work.mutation.operationId)
                    is MutationSendResult.Retryable -> repository.recordRetry(work.mutation.operationId, result.error)
                    is MutationSendResult.UpgradeRequired -> repository.recordRetry(work.mutation.operationId, result.error)
                    is MutationSendResult.PermanentFailure -> repository.recordFailure(work.mutation.operationId, result.error)
                    is MutationSendResult.Conflict -> repository.recordFailure(work.mutation.operationId, result.error)
                    MutationSendResult.AccountChanged -> false
                }
                if (updated && result is MutationSendResult.UpgradeRequired) {
                    // Pairing and account replacement use this same critical section, so a stale 426
                    // cannot transfer its compatibility marker to a different session.
                    onUpgradeRequired(result.error)
                }
                if (updated) OutboxCommit.Committed else OutboxCommit.Failed
            }
            if (commit == OutboxCommit.AccountChanged) return OutboxDrainResult.AccountChanged
            if (commit == OutboxCommit.Failed) return OutboxDrainResult.Retry
            when (result) {
                MutationSendResult.Success -> {
                    // Continue draining only after the scope-bound success commit.
                }
                is MutationSendResult.Retryable -> {
                    return OutboxDrainResult.Retry
                }
                is MutationSendResult.UpgradeRequired -> return OutboxDrainResult.Retry
                is MutationSendResult.PermanentFailure, is MutationSendResult.Conflict -> Unit
                MutationSendResult.AccountChanged -> return OutboxDrainResult.AccountChanged
            }
        }
        return OutboxDrainResult.Continue
    }
}

private sealed interface CapturedOutboxWork {
    data object Empty : CapturedOutboxWork
    data object NoSession : CapturedOutboxWork
    data class Work(val mutation: QueuedMutationEntity, val session: SecureSession) : CapturedOutboxWork
}

private enum class OutboxCommit { Committed, Failed, AccountChanged }

interface OutboxScheduler {
    fun schedule()
    fun scheduleContinuation()
}

const val OUTBOX_WORK_ERROR_KEY = "calibrate_sync_error"

object OutboxWorkPolicy {
    const val UNIQUE_WORK_NAME = "calibrate-wear-outbox-v1"
    const val WORK_TAG = "calibrate-wear-outbox"

    private const val PREFERENCES_NAME = "calibrate_outbox_work"
    private const val LATEST_WORK_ID_KEY = "latest_work_id"

    fun recordLatestWorkId(context: Context, workId: UUID) {
        context.applicationContext
            .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            // Commit synchronously so observers never see the work before its identity is durable.
            .putString(LATEST_WORK_ID_KEY, workId.toString())
            .commit()
    }

    fun latestWorkId(context: Context): UUID? {
        val stored = context.applicationContext
            .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .getString(LATEST_WORK_ID_KEY, null)
            ?: return null
        return runCatching { UUID.fromString(stored) }.getOrNull()
    }
}

class WorkManagerOutboxScheduler(context: Context) : OutboxScheduler {
    private val appContext = context.applicationContext
    private val workManager = WorkManager.getInstance(appContext)

    /** Avoids duplicate cold-start/onStart refreshes while still refreshing a surviving process. */
    fun scheduleForegroundRefresh() {
        if (foregroundRefreshGate.tryAcquire(SystemClock.elapsedRealtime())) schedule()
    }

    override fun schedule() = enqueue()

    override fun scheduleContinuation() = enqueue()

    private fun enqueue() = synchronized(enqueueLock) {
        val request = workRequest()
        workManager.enqueueUniqueWork(
            OutboxWorkPolicy.UNIQUE_WORK_NAME,
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            request
        )
        OutboxWorkPolicy.recordLatestWorkId(appContext, request.id)
    }

    private fun workRequest() = run {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        OneTimeWorkRequestBuilder<OutboxWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                OutboxRetryPolicy.INITIAL_BACKOFF_MS,
                TimeUnit.MILLISECONDS
            )
            .addTag(OutboxWorkPolicy.WORK_TAG)
            .build()
    }

    private companion object {
        val enqueueLock = Any()
        val foregroundRefreshGate = ForegroundRefreshGate(minimumIntervalMs = 60_000L)
    }
}

internal class ForegroundRefreshGate(private val minimumIntervalMs: Long) {
    private var lastAcquiredAtMs: Long? = null

    init {
        require(minimumIntervalMs >= 0) { "Foreground refresh interval cannot be negative." }
    }

    @Synchronized
    fun tryAcquire(nowElapsedMs: Long): Boolean {
        require(nowElapsedMs >= 0) { "Elapsed time cannot be negative." }
        val previous = lastAcquiredAtMs
        if (previous != null && nowElapsedMs >= previous && nowElapsedMs - previous < minimumIntervalMs) {
            return false
        }
        lastAcquiredAtMs = nowElapsedMs
        return true
    }
}

private object OutboxWorkerDependencies {
    fun create(context: Context): WearSyncDependencies = WearSyncRuntime.create(context)
}

class OutboxWorker(
    appContext: Context,
    workerParameters: WorkerParameters
) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): Result {
        val dependencies = OutboxWorkerDependencies.create(applicationContext)
        val capturedInvalidationId = SyncInvalidationInbox.pendingId(applicationContext)
        return when (dependencies.outboxProcessor.drain()) {
            OutboxDrainResult.Complete -> {
                val syncResult = dependencies.snapshotSynchronizer.refresh {
                    dependencies.outboxRepository.confirmSnapshotRefresh()
                    SyncInvalidationInbox.completeRefresh(applicationContext, capturedInvalidationId)
                }
                when (syncResult) {
                    SnapshotSyncResult.Success, SnapshotSyncResult.NotModified -> {
                        // Notification failures must never turn a committed health sync into failed work.
                        runCatching { WearReminderNotifier(applicationContext).evaluate() }
                        CalibrateTileUpdate.request(applicationContext)
                        Result.success()
                    }
                    is SnapshotSyncResult.Retryable -> {
                        if (BuildConfig.DEBUG) {
                            Log.w(WORKER_LOG_TAG, "Snapshot refresh will retry: ${syncResult.message}")
                        }
                        Result.retry()
                    }
                    is SnapshotSyncResult.PermanentFailure -> {
                        if (BuildConfig.DEBUG) {
                            Log.e(WORKER_LOG_TAG, "Snapshot refresh failed: ${syncResult.message}")
                        }
                        Result.failure(workDataOf(OUTBOX_WORK_ERROR_KEY to syncResult.message))
                    }
                    SnapshotSyncResult.AccountChanged -> Result.success()
                }
            }
            OutboxDrainResult.Continue -> {
                WorkManagerOutboxScheduler(applicationContext).scheduleContinuation()
                Result.success()
            }
            OutboxDrainResult.Retry -> Result.retry()
            OutboxDrainResult.AccountChanged -> Result.success()
        }
    }

    private companion object {
        const val WORKER_LOG_TAG = "CalibrateWearSync"
    }
}
