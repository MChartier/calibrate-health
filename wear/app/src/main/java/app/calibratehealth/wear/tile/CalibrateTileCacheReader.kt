package app.calibratehealth.wear.tile

import app.calibratehealth.wear.data.local.CalibrateWearDatabase
import app.calibratehealth.wear.data.security.AccountStateCriticalSection
import app.calibratehealth.wear.data.security.SecureTokenStore
import kotlinx.coroutines.flow.first

/** Reads only the local Room cache. Tile rendering must never initiate network work. */
class CalibrateTileCacheReader(
    private val database: CalibrateWearDatabase,
    private val tokenStore: SecureTokenStore,
    private val accountState: AccountStateCriticalSection = AccountStateCriticalSection.Shared
) {
    suspend fun latest(): CalibrateTileSnapshot? = accountState.withLock {
        // Keep snapshot and sync metadata from straddling an account replacement/clear.
        val session = runCatching { tokenStore.read() }.getOrNull() ?: return@withLock null
        val snapshot = database.dailySnapshotDao().observeLatest().first() ?: return@withLock null
        val metadata = database.syncMetadataDao().observe().first() ?: return@withLock null
        if (metadata.serverOrigin != session.serverOrigin) return@withLock null
        CalibrateTileSnapshot(
            caloriesConsumed = snapshot.caloriesConsumed,
            calorieTarget = snapshot.calorieTarget,
            caloriesRemaining = snapshot.caloriesRemaining,
            steps = snapshot.steps,
            activityStale = snapshot.activityStale,
            isComplete = snapshot.foodDayComplete,
            cachedAtEpochMs = metadata.lastSuccessAtEpochMs ?: snapshot.fetchedAtEpochMs
        )
    }
}
