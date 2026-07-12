package app.calibratehealth.wear.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import app.calibratehealth.wear.R
import app.calibratehealth.wear.WearDataLayerContract
import app.calibratehealth.wear.data.local.CalibrateWearDatabase
import app.calibratehealth.wear.data.local.DailySnapshotEntity
import app.calibratehealth.wear.data.local.QueuedMutationEntity
import app.calibratehealth.wear.data.local.QuickAddItemEntity
import app.calibratehealth.wear.data.local.SyncMetadataEntity
import app.calibratehealth.wear.data.security.AndroidKeystoreTokenStore
import app.calibratehealth.wear.data.security.RoomAccountDataStore
import app.calibratehealth.wear.data.security.SecureSession
import app.calibratehealth.wear.data.security.SecureTokenCorruptedException
import java.security.KeyStore
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WearPersistenceInstrumentedTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val databaseName = "wear-persistence-test.db"
    private val migrationDatabaseName = "wear-migration-test.db"
    private val preferencesName = "wear-secure-session-test"
    private val keyAlias = "calibrate_wear_session_test"

    @After
    fun cleanUp() {
        context.deleteDatabase(databaseName)
        context.deleteDatabase(migrationDatabaseName)
        context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).edit().clear().commit()
        KeyStore.getInstance("AndroidKeyStore").apply {
            load(null)
            if (containsAlias(keyAlias)) deleteEntry(keyAlias)
        }
    }

    @Test
    fun roomStateSurvivesDatabaseReopenAndKeepsFifoOrder() = runBlocking {
        var database = CalibrateWearDatabase.open(context, databaseName)
        database.dailySnapshotDao().cacheBounded(snapshot("2026-07-09"), maxRows = 2)
        database.dailySnapshotDao().cacheBounded(snapshot("2026-07-11"), maxRows = 2)
        database.dailySnapshotDao().cacheBounded(snapshot("2026-07-10"), maxRows = 2)
        database.quickAddItemDao().cacheBounded(
            listOf(quickAdd("third", 3), quickAdd("first", 1), quickAdd("second", 2)),
            maxRows = 2
        )
        database.queuedMutationDao().insert(mutation("b", 100))
        database.queuedMutationDao().insert(mutation("a", 100))
        database.syncMetadataDao().upsert(
            SyncMetadataEntity(
                serverOrigin = "https://health.example.com",
                syncCursor = "cursor-1",
                lastSuccessAtEpochMs = 123,
                invalidatedAtEpochMs = null,
                protocolVersion = 1
            )
        )
        database.close()

        database = CalibrateWearDatabase.open(context, databaseName)
        assertEquals(
            listOf("2026-07-11", "2026-07-10"),
            database.dailySnapshotDao().allNewestFirst().map { it.localDate }
        )
        val latest = database.dailySnapshotDao().allNewestFirst().first()
        assertEquals(1250, latest.caloriesRemaining)
        assertEquals(2100, latest.activityTotalCalories)
        assertEquals(40, latest.exerciseMinutes)
        assertEquals(123_000L, latest.activityObservedAtEpochMs)
        assertEquals(false, latest.activityStale)
        assertEquals(300L, latest.activityAgeSeconds)
        assertEquals(true, latest.foodDayComplete)
        assertEquals("food-day-revision", latest.foodDayRevision)
        assertEquals(81_500L, latest.todayWeightGrams)
        assertEquals("today-weight-revision", latest.todayWeightRevision)
        assertEquals("latest-weight-revision", latest.latestWeightRevision)
        assertEquals("2026-07-11", latest.latestWeightDate)
        assertEquals("LB", latest.weightUnit)
        assertEquals(44L, latest.undoFoodLogId)
        assertEquals("Yogurt", latest.undoName)
        assertEquals(120, latest.undoCalories)
        assertEquals(125_000L, latest.undoCreatedAtEpochMs)
        assertEquals(listOf("b", "a"), database.queuedMutationDao().pendingInFifoOrder().map { it.operationId })
        assertEquals(listOf("first", "second"), database.quickAddItemDao().all().map { it.quickAddId })
        assertEquals(1, database.queuedMutationDao().markRetry("b", "offline"))
        assertEquals(1, database.queuedMutationDao().head()?.attemptCount)
        assertEquals(1, database.queuedMutationDao().markServerSucceeded("b"))
        assertEquals(listOf("b", "a"), database.queuedMutationDao().activeInFifoOrder().map { it.operationId })
        assertEquals(1, database.queuedMutationDao().confirmSnapshotRefresh())
        assertEquals(listOf("a"), database.queuedMutationDao().activeInFifoOrder().map { it.operationId })
        assertEquals("cursor-1", database.syncMetadataDao().get()?.syncCursor)
        database.close()
    }

    @Test
    fun keystoreSessionSurvivesStoreRecreation() {
        val session = SecureSession(
            accessToken = "secret-access-token",
            refreshToken = "secret-refresh-token",
            userId = 1,
            serverOrigin = "https://health.example.com",
            watchDeviceId = "watch-1",
            accessExpiresAtEpochMs = 123_456,
            refreshExpiresAtEpochMs = 223_456
        )
        AndroidKeystoreTokenStore(context, keyAlias, preferencesName, session.serverOrigin).write(session)
        val reopened = AndroidKeystoreTokenStore(context, keyAlias, preferencesName, session.serverOrigin)
        assertEquals(session, reopened.read())
        assertThrows(SecureTokenCorruptedException::class.java) {
            AndroidKeystoreTokenStore(
                context,
                keyAlias,
                preferencesName,
                "https://other.example.com"
            ).read()
        }
        reopened.clear()
        assertNull(reopened.read())
    }

    @Test
    fun databaseCanBeCreatedWithAllDaos() {
        val database = CalibrateWearDatabase.open(context, databaseName)
        assertNotNull(database.dailySnapshotDao())
        assertNotNull(database.quickAddItemDao())
        assertNotNull(database.queuedMutationDao())
        assertNotNull(database.syncMetadataDao())
        database.close()
    }

    @Test
    fun versionTwoSnapshotMigrationUsesFailSafeDefaults() {
        val configuration = SupportSQLiteOpenHelper.Configuration.builder(context)
            .name(migrationDatabaseName)
            .callback(object : SupportSQLiteOpenHelper.Callback(2) {
                override fun onCreate(database: SupportSQLiteDatabase) {
                    database.execSQL(
                        """
                        CREATE TABLE daily_snapshots (
                            local_date TEXT NOT NULL PRIMARY KEY,
                            calories_consumed INTEGER,
                            calorie_target INTEGER,
                            steps INTEGER,
                            activity_calories INTEGER,
                            latest_weight_grams INTEGER,
                            server_revision TEXT,
                            fetched_at_epoch_ms INTEGER NOT NULL
                        )
                        """.trimIndent()
                    )
                    database.execSQL(
                        "INSERT INTO daily_snapshots (local_date, calories_consumed, fetched_at_epoch_ms) " +
                            "VALUES ('2026-07-11', 750, 42)"
                    )
                }

                override fun onUpgrade(database: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
            })
            .build()
        val helper = FrameworkSQLiteOpenHelperFactory().create(configuration)
        val database = helper.writableDatabase

        CalibrateWearDatabase.MIGRATION_2_3.migrate(database)

        database.query("SELECT * FROM daily_snapshots WHERE local_date = '2026-07-11'").use { cursor ->
            assertEquals(true, cursor.moveToFirst())
            assertEquals(1, cursor.getInt(cursor.getColumnIndexOrThrow("activity_stale")))
            assertEquals(0, cursor.getInt(cursor.getColumnIndexOrThrow("food_day_complete")))
            assertEquals("KG", cursor.getString(cursor.getColumnIndexOrThrow("weight_unit")))
            assertEquals(true, cursor.isNull(cursor.getColumnIndexOrThrow("today_weight_grams")))
            assertEquals(true, cursor.isNull(cursor.getColumnIndexOrThrow("undo_food_log_id")))
        }
        helper.close()
    }

    @Test
    fun roomAccountDataStoreClearsEveryAccountScopedTable() = runBlocking {
        val database = CalibrateWearDatabase.open(context, databaseName)
        database.dailySnapshotDao().cacheBounded(snapshot("2026-07-11"), maxRows = 2)
        database.quickAddItemDao().cacheBounded(listOf(quickAdd("food-1", 1)), maxRows = 2)
        database.queuedMutationDao().insert(mutation("operation-1", 100))
        database.syncMetadataDao().upsert(
            SyncMetadataEntity(
                serverOrigin = "https://health.example.com",
                syncCursor = "cursor-1",
                lastSuccessAtEpochMs = 123,
                invalidatedAtEpochMs = null,
                protocolVersion = 1
            )
        )

        RoomAccountDataStore(database).clearAll()

        assertEquals(emptyList<DailySnapshotEntity>(), database.dailySnapshotDao().allNewestFirst())
        assertEquals(emptyList<QuickAddItemEntity>(), database.quickAddItemDao().all())
        assertNull(database.queuedMutationDao().head())
        assertNull(database.syncMetadataDao().get())
        database.close()
    }

    @Test
    fun publishedPairingCapabilityMatchesContract() {
        val capabilities = context.resources.getStringArray(R.array.android_wear_capabilities)
        assertEquals(listOf(WearDataLayerContract.PAIRING_CAPABILITY), capabilities.toList())
    }

    private fun snapshot(localDate: String) = DailySnapshotEntity(
        localDate = localDate,
        caloriesConsumed = 750,
        calorieTarget = 2_000,
        caloriesRemaining = 1_250,
        steps = 12_345,
        activityCalories = 350,
        activityTotalCalories = 2_100,
        exerciseMinutes = 40,
        activityObservedAtEpochMs = 123_000,
        activityStale = false,
        activityAgeSeconds = 300,
        foodDayComplete = true,
        foodDayCompletedAtEpochMs = 124_000,
        foodDayRevision = "food-day-revision",
        todayWeightGrams = 81_500,
        todayWeightRevision = "today-weight-revision",
        latestWeightGrams = 81_500,
        latestWeightRevision = "latest-weight-revision",
        latestWeightDate = localDate,
        weightUnit = "LB",
        undoFoodLogId = 44,
        undoName = "Yogurt",
        undoCalories = 120,
        undoCreatedAtEpochMs = 125_000,
        serverRevision = "server-revision",
        fetchedAtEpochMs = 126_000
    )

    private fun mutation(id: String, createdAt: Long) = QueuedMutationEntity(
        operationId = id,
        mutationType = "food.create",
        payloadJson = "{}",
        createdAtEpochMs = createdAt
    )

    private fun quickAdd(id: String, rank: Int) = QuickAddItemEntity(
        quickAddId = id,
        name = id,
        mealPeriod = null,
        calories = 100,
        servingDescription = "1 serving",
        mutationPayloadJson = "{}",
        sortRank = rank,
        updatedAtEpochMs = 0
    )
}
