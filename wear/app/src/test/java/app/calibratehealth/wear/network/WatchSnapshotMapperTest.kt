package app.calibratehealth.wear.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchSnapshotMapperTest {
    @Test
    fun `maps bounded snapshot and preserves quick-add draft as mutation payload`() {
        val result = WatchSnapshotMapper.map(validSnapshot(), fetchedAtEpochMs = 42L)

        assertEquals("2026-07-11", result.dailySnapshot.localDate)
        assertEquals(750, result.dailySnapshot.caloriesConsumed)
        assertEquals(2_000, result.dailySnapshot.calorieTarget)
        assertEquals(12_345, result.dailySnapshot.steps)
        assertEquals(350, result.dailySnapshot.activityCalories)
        assertEquals(81_500L, result.dailySnapshot.latestWeightGrams)
        assertEquals("0123456789abcdef01234567", result.revision)
        assertEquals(1, result.quickAddItems.size)
        assertEquals("my-food:4", result.quickAddItems.single().quickAddId)
        assertEquals(
            "{\"date\":\"2026-07-11\",\"meal_period\":\"LUNCH\",\"my_food_id\":4,\"servings_consumed\":1}",
            result.quickAddItems.single().mutationPayloadJson
        )
    }

    @Test
    fun `rejects duplicate quick-add ids and malformed revisions`() {
        val duplicated = validSnapshot().replace(
            "] ,\"undo_candidate\"",
            ", {\"id\":\"my-food:4\",\"source\":\"recent\",\"label\":\"Duplicate\",\"calories\":10,\"draft\":{\"date\":\"2026-07-11\",\"meal_period\":\"LUNCH\",\"name\":\"Duplicate\",\"calories\":10}}] ,\"undo_candidate\""
        )
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
          "revision":"0123456789abcdef01234567",
          "local_date":"2026-07-11",
          "calories":{"consumed":750,"target":2000,"remaining":1250,"missing":[]},
          "activity":{"steps":12345,"active_calories_kcal":349.6,"total_calories_kcal":2100.0,"exercise_minutes":40.0,"observed_at":"2026-07-11T00:55:00Z"},
          "food_day":{"is_complete":false,"completed_at":null,"revision":null},
          "weight":{"today_grams":81500,"today_revision":"abcdef0123456789abcdef01","latest_grams":81500,"latest_date":"2026-07-11"},
          "quick_add":[
            {"id":"my-food:4","source":"pinned","label":"Yogurt","calories":120,"draft":{"date":"2026-07-11","meal_period":"LUNCH","my_food_id":4,"servings_consumed":1}}
          ] ,"undo_candidate":null,
          "staleness":{"activity_stale":false,"activity_age_seconds":300}
        }
    """.trimIndent()
}
