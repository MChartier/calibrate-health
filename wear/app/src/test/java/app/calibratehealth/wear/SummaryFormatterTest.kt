package app.calibratehealth.wear

import org.junit.Assert.assertEquals
import org.junit.Test

class SummaryFormatterTest {
    @Test
    fun `formats cached summary without changing calorie sign meaning`() {
        val base = summary(caloriesRemaining = 640)
        assertEquals("640 kcal left", SummaryFormatter.caloriesRemaining(base))
        assertEquals("125 kcal over", SummaryFormatter.caloriesRemaining(base.copy(caloriesRemaining = -125)))
        assertEquals("1360 of 2000 kcal", SummaryFormatter.calorieProgress(base))
        assertEquals("12,345", SummaryFormatter.steps(base))
    }

    @Test
    fun `formats canonical grams at the selected unit edge`() {
        assertEquals("72.4 kg", SummaryFormatter.weight(72_400, "kg"))
        assertEquals("159.6 lb", SummaryFormatter.weight(72_400, "lb"))
        assertEquals("--", SummaryFormatter.weight(null, "kg"))
    }

    @Test
    fun `surfaces stale and pending states explicitly`() {
        val stale = summary(activityStale = true)
        assertEquals("450 active kcal | Activity may be stale", SummaryFormatter.activity(stale))
        assertEquals("2 changes pending", SummaryFormatter.sync(WearSyncStatus.Pending(2), stale.lastSyncAtEpochMs))
        assertEquals("A queued change failed", SummaryFormatter.sync(WearSyncStatus.Error("A queued change failed"), null))
    }

    private fun summary(
        caloriesRemaining: Int? = 640,
        activityStale: Boolean = false
    ) = WearSummary(
        localDate = "2026-07-12",
        caloriesRemaining = caloriesRemaining,
        caloriesConsumed = 1_360,
        calorieTarget = 2_000,
        steps = 12_345,
        activityCalories = 450,
        activityStale = activityStale,
        activityAgeSeconds = if (activityStale) 7_200 else 60,
        foodDayComplete = false,
        foodDayRevision = "aaaaaaaaaaaaaaaaaaaaaaaa",
        todayWeightGrams = 72_400,
        todayWeightRevision = "bbbbbbbbbbbbbbbbbbbbbbbb",
        latestWeightGrams = 72_400,
        latestWeightDate = "2026-07-12",
        weightUnit = "kg",
        undoFoodLogId = 41,
        undoName = "Yogurt",
        undoCalories = 130,
        fetchedAtEpochMs = 1_000,
        lastSyncAtEpochMs = 1_000
    )
}
