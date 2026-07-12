package app.calibratehealth.wear.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import app.calibratehealth.wear.notifications.WearReminderType

class WatchSnapshotMapperTest {
    @Test
    fun `maps bounded snapshot and preserves quick-add draft as mutation payload`() {
        val result = WatchSnapshotMapper.map(validSnapshot(), fetchedAtEpochMs = 42L)

        assertEquals("2026-07-11", result.dailySnapshot.localDate)
        assertEquals(750, result.dailySnapshot.caloriesConsumed)
        assertEquals(2_000, result.dailySnapshot.calorieTarget)
        assertEquals(1_250, result.dailySnapshot.caloriesRemaining)
        assertEquals(12_345, result.dailySnapshot.steps)
        assertEquals(350, result.dailySnapshot.activityCalories)
        assertEquals(2_100, result.dailySnapshot.activityTotalCalories)
        assertEquals(40, result.dailySnapshot.exerciseMinutes)
        assertEquals(1_783_731_300_000L, result.dailySnapshot.activityObservedAtEpochMs)
        assertEquals(false, result.dailySnapshot.activityStale)
        assertEquals(300L, result.dailySnapshot.activityAgeSeconds)
        assertEquals(true, result.dailySnapshot.foodDayComplete)
        assertEquals(1_783_731_600_000L, result.dailySnapshot.foodDayCompletedAtEpochMs)
        assertEquals("fedcba9876543210fedcba98", result.dailySnapshot.foodDayRevision)
        assertEquals(81_500L, result.dailySnapshot.todayWeightGrams)
        assertEquals("abcdef0123456789abcdef01", result.dailySnapshot.todayWeightRevision)
        assertEquals(81_500L, result.dailySnapshot.latestWeightGrams)
        assertEquals("abcdef0123456789abcdef01", result.dailySnapshot.latestWeightRevision)
        assertEquals("2026-07-11", result.dailySnapshot.latestWeightDate)
        assertEquals("LB", result.dailySnapshot.weightUnit)
        assertEquals(44L, result.dailySnapshot.undoFoodLogId)
        assertEquals("Yogurt", result.dailySnapshot.undoName)
        assertEquals(120, result.dailySnapshot.undoCalories)
        assertEquals(1_783_731_900_000L, result.dailySnapshot.undoCreatedAtEpochMs)
        assertEquals(42L, result.dailySnapshot.fetchedAtEpochMs)
        assertEquals("0123456789abcdef01234567", result.revision)
        assertEquals(2, result.reminders.size)
        assertEquals(setOf(WearReminderType.FOOD, WearReminderType.WEIGHT), result.reminders.map { it.type }.toSet())
        assertEquals(1, result.quickAddItems.size)
        assertEquals("my-food:4", result.quickAddItems.single().quickAddId)
        assertEquals(
            "{\"date\":\"2026-07-11\",\"meal_period\":\"LUNCH\",\"my_food_id\":4,\"servings_consumed\":1}",
            result.quickAddItems.single().mutationPayloadJson
        )
    }

    @Test
    fun `rejects duplicate quick-add ids and malformed revisions`() {
        val snapshot = validSnapshot()
        val quickAdd =
            "{\"id\":\"my-food:4\",\"source\":\"pinned\",\"label\":\"Yogurt\",\"calories\":120," +
                "\"draft\":{\"date\":\"2026-07-11\",\"meal_period\":\"LUNCH\",\"my_food_id\":4," +
                "\"servings_consumed\":1}}"
        val duplicated = snapshot.replace(
            quickAdd,
            "$quickAdd,$quickAdd"
        )
        assertTrue(duplicated != snapshot)
        assertTrue(runCatching { WatchSnapshotMapper.map(duplicated, 42L) }.isFailure)
        assertTrue(runCatching {
            WatchSnapshotMapper.map(validSnapshot().replace("0123456789abcdef01234567", "bad"), 42L)
        }.isFailure)
    }

    @Test
    fun `strict parser rejects duplicate keys and trailing input`() {
        assertTrue(runCatching { StrictJson.parse("{\"a\":1,\"a\":2}") }.isFailure)
        assertTrue(runCatching { StrictJson.parse("{}[]") }.isFailure)
    }

    private fun validSnapshot(): String = """
        {
          "server_time":"2026-07-11T01:00:00Z",
          "timezone":"America/Los_Angeles",
          "weight_unit":"LB",
          "revision":"0123456789abcdef01234567",
          "local_date":"2026-07-11",
          "calories":{"consumed":750,"target":2000,"remaining":1250,"missing":[]},
          "activity":{"steps":12345,"active_calories_kcal":349.6,"total_calories_kcal":2100.0,"exercise_minutes":40.0,"observed_at":"2026-07-11T00:55:00Z"},
          "food_day":{"is_complete":true,"completed_at":"2026-07-11T01:00:00Z","revision":"fedcba9876543210fedcba98"},
          "weight":{"today_grams":81500,"today_revision":"abcdef0123456789abcdef01","latest_grams":81500,"latest_revision":"abcdef0123456789abcdef01","latest_date":"2026-07-11"},
          "quick_add":[
            {"id":"my-food:4","source":"pinned","label":"Yogurt","calories":120,"draft":{"date":"2026-07-11","meal_period":"LUNCH","my_food_id":4,"servings_consumed":1}}
          ],
          "reminders":[
            {"id":51,"type":"food","local_date":"2026-07-11","created_at":"2026-07-11T09:00:00Z"},
            {"id":52,"type":"weight","local_date":"2026-07-11","created_at":"2026-07-11T09:00:00Z"}
          ],
          "undo_candidate":{"food_log_id":44,"name":"Yogurt","calories":120,"created_at":"2026-07-11T01:05:00Z"},
          "staleness":{"activity_stale":false,"activity_age_seconds":300}
        }
    """.trimIndent()
}
