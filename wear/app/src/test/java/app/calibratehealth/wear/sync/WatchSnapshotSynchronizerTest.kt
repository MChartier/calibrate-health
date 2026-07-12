package app.calibratehealth.wear.sync

import app.calibratehealth.wear.data.DailySnapshotRepository
import app.calibratehealth.wear.data.QuickAddRepository
import app.calibratehealth.wear.data.SyncMetadataRepository
import app.calibratehealth.wear.data.local.DailySnapshotEntity
import app.calibratehealth.wear.data.local.QuickAddItemEntity
import app.calibratehealth.wear.data.local.SyncMetadataEntity
import app.calibratehealth.wear.network.AuthenticatedApiResult
import app.calibratehealth.wear.network.WatchHttpResponse
import app.calibratehealth.wear.network.WatchSnapshotApi
import app.calibratehealth.wear.data.security.SecureSession
import app.calibratehealth.wear.data.security.SecureTokenStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchSnapshotSynchronizerTest {
    @Test
    fun `clears old etag before cache writes and stores replacement etag last`() = runBlocking {
        val events = mutableListOf<String>()
        val existing = SyncMetadataEntity(
            serverOrigin = "https://health.example.com",
            syncCursor = "W/\"watch-old\"",
            lastSuccessAtEpochMs = 1,
            invalidatedAtEpochMs = null,
            protocolVersion = 1
        )
        val metadata = RecordingMetadataRepository(existing, events)
        val tokenStore = MemoryTokenStore(session())
        val synchronizer = WatchSnapshotSynchronizer(
            api = WatchSnapshotApi { _, etag ->
                assertEquals(existing.syncCursor, etag)
                AuthenticatedApiResult.Response(
                    WatchHttpResponse(200, mapOf("ETag" to "W/\"watch-new\""), validSnapshot())
                )
            },
            snapshots = RecordingSnapshotRepository(events),
            quickAdds = RecordingQuickAddRepository(events),
            metadata = metadata,
            tokenStore = tokenStore,
            nowEpochMs = { 42 }
        )

        assertTrue(synchronizer.refresh { events += "outbox.unlock" } is SnapshotSyncResult.Success)
        assertEquals(
            listOf("metadata.clear", "snapshot.cache", "quick_add.cache", "metadata.store", "outbox.unlock"),
            events
        )
        assertEquals("W/\"watch-new\"", metadata.value?.syncCursor)
    }

    @Test
    fun `account switch during fetch cannot commit snapshot rows`() = runBlocking {
        val events = mutableListOf<String>()
        val tokenStore = MemoryTokenStore(session())
        val synchronizer = WatchSnapshotSynchronizer(
            api = WatchSnapshotApi { _, _ ->
                tokenStore.value = session().copy(userId = 99)
                AuthenticatedApiResult.Response(
                    WatchHttpResponse(200, mapOf("ETag" to "W/\"watch-new\""), validSnapshot())
                )
            },
            snapshots = RecordingSnapshotRepository(events),
            quickAdds = RecordingQuickAddRepository(events),
            metadata = RecordingMetadataRepository(
                SyncMetadataEntity(serverOrigin = "https://health.example.com", syncCursor = null, lastSuccessAtEpochMs = null, invalidatedAtEpochMs = null, protocolVersion = 1),
                events
            ),
            tokenStore = tokenStore,
            nowEpochMs = { 42 }
        )

        assertEquals(SnapshotSyncResult.AccountChanged, synchronizer.refresh { events += "outbox.unlock" })
        assertTrue(events.isEmpty())
    }

    private class RecordingSnapshotRepository(private val events: MutableList<String>) : DailySnapshotRepository {
        override fun observeLatest(): Flow<DailySnapshotEntity?> = MutableStateFlow(null)
        override suspend fun allNewestFirst(): List<DailySnapshotEntity> = emptyList()
        override suspend fun cache(snapshot: DailySnapshotEntity) { events += "snapshot.cache" }
    }

    private class RecordingQuickAddRepository(private val events: MutableList<String>) : QuickAddRepository {
        override fun observeAll(): Flow<List<QuickAddItemEntity>> = MutableStateFlow(emptyList())
        override suspend fun all(): List<QuickAddItemEntity> = emptyList()
        override suspend fun cache(items: List<QuickAddItemEntity>) { events += "quick_add.cache" }
    }

    private class RecordingMetadataRepository(
        initial: SyncMetadataEntity,
        private val events: MutableList<String>
    ) : SyncMetadataRepository {
        var value: SyncMetadataEntity? = initial
        override fun observe(): Flow<SyncMetadataEntity?> = MutableStateFlow(value)
        override suspend fun get(): SyncMetadataEntity? = value
        override suspend fun store(metadata: SyncMetadataEntity) {
            events += "metadata.store"
            value = metadata
        }
        override suspend fun clear() {
            events += "metadata.clear"
            value = null
        }
    }

    private class MemoryTokenStore(var value: SecureSession?) : SecureTokenStore {
        override fun read(): SecureSession? = value
        override fun write(session: SecureSession) { value = session }
        override fun clear() { value = null }
    }

    private fun session() = SecureSession(
        accessToken = "access",
        refreshToken = "refresh",
        userId = 7,
        serverOrigin = "https://health.example.com",
        watchDeviceId = "watch-7",
        accessExpiresAtEpochMs = 100_000,
        refreshExpiresAtEpochMs = 200_000
    )

    private fun validSnapshot(): String = """
        {
          "server_time":"2026-07-11T01:00:00Z","timezone":"America/Los_Angeles","weight_unit":"KG",
          "revision":"0123456789abcdef01234567","local_date":"2026-07-11",
          "calories":{"consumed":750,"target":2000,"remaining":1250,"missing":[]},
          "activity":null,
          "food_day":{"is_complete":false,"completed_at":null,"revision":null},
          "weight":{"today_grams":null,"today_revision":null,"latest_grams":81500,"latest_revision":"abcdef0123456789abcdef01","latest_date":"2026-07-11"},
          "quick_add":[{"id":"my-food:4","source":"pinned","label":"Yogurt","calories":120,"draft":{"date":"2026-07-11","meal_period":"LUNCH","my_food_id":4,"servings_consumed":1}}],
          "undo_candidate":null,"staleness":{"activity_stale":true,"activity_age_seconds":null}
        }
    """.trimIndent()
}
