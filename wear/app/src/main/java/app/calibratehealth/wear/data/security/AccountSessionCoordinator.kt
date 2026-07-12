package app.calibratehealth.wear.data.security

import androidx.room.withTransaction
import app.calibratehealth.wear.data.local.CalibrateWearDatabase
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class AccountScope(val serverOrigin: String, val userId: Long)

fun SecureSession.accountScope(): AccountScope = AccountScope(serverOrigin, userId)

/** Serializes account swaps with the short capture/commit sections used by sync workers. */
class AccountStateCriticalSection private constructor() {
    private val mutex = Mutex()

    suspend fun <T> withLock(block: suspend () -> T): T = mutex.withLock { block() }

    companion object {
        val Shared = AccountStateCriticalSection()
        fun isolatedForTest(): AccountStateCriticalSection = AccountStateCriticalSection()
    }
}

fun interface AccountDataStore {
    suspend fun clearAll()
}

class RoomAccountDataStore(
    private val database: CalibrateWearDatabase
) : AccountDataStore {
    override suspend fun clearAll() {
        // One transaction prevents a partially cleared cache from becoming visible after pairing.
        database.withTransaction {
            database.dailySnapshotDao().clearAll()
            database.quickAddItemDao().clearAll()
            database.queuedMutationDao().clearAll()
            database.syncMetadataDao().clear()
        }
    }
}

class AccountSessionCoordinator(
    private val tokenStore: SecureTokenStore,
    private val accountDataStore: AccountDataStore,
    private val criticalSection: AccountStateCriticalSection = AccountStateCriticalSection.Shared
) {
    suspend fun replace(session: SecureSession) = criticalSection.withLock {
        session.requireValid()
        val existing = try {
            tokenStore.read()
        } catch (_: SecureTokenCorruptedException) {
            null
        }
        val sameAccount = existing != null &&
            existing.serverOrigin == session.serverOrigin &&
            existing.userId == session.userId

        if (sameAccount) {
            tokenStore.write(session)
            return@withLock
        }

        // Fail closed: revoke access to old data, clear it atomically, then expose the new session.
        tokenStore.clear()
        accountDataStore.clearAll()
        tokenStore.write(session)
    }

    suspend fun clear() = criticalSection.withLock {
        // Clearing credentials first prevents stale account rows from being read if deletion fails.
        tokenStore.clear()
        accountDataStore.clearAll()
    }

    /** Rotate credentials only while the account that initiated the request is still active. */
    suspend fun replaceIfScopeCurrent(expected: AccountScope, session: SecureSession): Boolean =
        criticalSection.withLock {
            session.requireValid()
            require(session.accountScope() == expected) { "Rotated session changed account scope." }
            val current = try {
                tokenStore.read()
            } catch (_: SecureTokenCorruptedException) {
                null
            }
            if (current?.accountScope() != expected) return@withLock false
            tokenStore.write(session)
            true
        }
}
