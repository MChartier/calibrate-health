package app.calibratehealth.wear

import org.junit.Assert.assertEquals
import org.junit.Test

class CalorieProgressTest {
    @Test
    fun `dashboard diameter uses the full smaller screen dimension`() {
        assertEquals(120f, summaryDashboardDiameter(widthDp = 192f, heightDp = 120f))
        assertEquals(192f, summaryDashboardDiameter(widthDp = 192f, heightDp = 220f))
        assertEquals(3f, summaryDashboardDiameter(widthDp = 3f, heightDp = 3f))
    }

    @Test
    fun `progress is bounded and handles unavailable targets`() {
        assertEquals(0.5f, calorieProgressFraction(consumed = 1_000, target = 2_000))
        assertEquals(1f, calorieProgressFraction(consumed = 2_500, target = 2_000))
        assertEquals(null, calorieProgressFraction(consumed = null, target = 2_000))
        assertEquals(null, calorieProgressFraction(consumed = 500, target = 0))
    }

    @Test
    fun `accessibility description states consumed target and signed balance`() {
        val summary = summary(caloriesRemaining = 640)
        assertEquals(
            "1,360 calories consumed of 2,000. 640 calories remaining.",
            calorieAccessibilityDescription(summary)
        )
        assertEquals(
            "1,360 calories consumed of 2,000. 125 calories over target.",
            calorieAccessibilityDescription(summary.copy(caloriesRemaining = -125))
        )
    }

    @Test
    fun `goal copy prioritizes progress and handles completion`() {
        val goal = summary(caloriesRemaining = 640).copy(
            goalStartWeightGrams = 90_000,
            goalTargetWeightGrams = 80_000,
            goalCurrentWeightGrams = 85_800,
            goalDailyDeficit = 500,
            goalProgressPercent = 42.0,
            goalRemainingWeightGrams = 5_800,
            goalIsComplete = false
        )

        assertEquals("42% to goal", goalProgressHeadline(goal))
        assertEquals(0.42f, goalProgressFraction(goal))
        assertEquals("Current 85.8 kg | Goal 80.0 kg", goalProgressDetail(goal))
        assertEquals("Goal reached", goalProgressHeadline(goal.copy(goalIsComplete = true)))
        assertEquals(1f, goalProgressFraction(goal.copy(goalIsComplete = true)))
        assertEquals("Maintenance goal", goalProgressHeadline(goal.copy(goalDailyDeficit = 0, goalIsComplete = true)))
        assertEquals(null, goalProgressFraction(goal.copy(goalDailyDeficit = 0, goalIsComplete = true)))
        assertEquals(
            "Maintenance goal. Current 85.8 kg. Goal 80.0 kg. 5.8 kg from target.",
            goalAccessibilityDescription(goal.copy(goalDailyDeficit = 0, goalIsComplete = true))
        )
    }

    private fun summary(caloriesRemaining: Int?) = WearSummary(
        localDate = "2026-07-12",
        caloriesRemaining = caloriesRemaining,
        caloriesConsumed = 1_360,
        calorieTarget = 2_000,
        foodDayComplete = false,
        foodDayRevision = null,
        todayWeightGrams = 72_400,
        todayWeightRevision = null,
        latestWeightGrams = 72_400,
        latestWeightDate = "2026-07-12",
        weightUnit = "kg",
        undoFoodLogId = null,
        undoName = null,
        undoCalories = null,
        fetchedAtEpochMs = 1_000,
        lastSyncAtEpochMs = 1_000
    )
}
