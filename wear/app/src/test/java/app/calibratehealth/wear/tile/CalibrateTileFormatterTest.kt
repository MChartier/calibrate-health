package app.calibratehealth.wear.tile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CalibrateTileFormatterTest {
    @Test
    fun `formats remaining consumed target and freshness`() {
        val result = CalibrateTileFormatter.format(
            CalibrateTileSnapshot(
                caloriesConsumed = 1_500,
                calorieTarget = 2_000,
                caloriesRemaining = 500,
                cachedAtEpochMs = NOW - 5 * MINUTE_MS
            ),
            NOW
        )

        assertEquals("500 kcal left", result.calorieLine)
        assertEquals("1,500 of 2,000 kcal", result.consumedLine)
        assertEquals("5 min ago", result.statusLine)
        assertFalse(result.isStale)
    }

    @Test
    fun `formats calories over and marks old cache stale`() {
        val result = CalibrateTileFormatter.format(
            CalibrateTileSnapshot(
                caloriesConsumed = 2_250,
                calorieTarget = 2_000,
                caloriesRemaining = -250,
                cachedAtEpochMs = NOW - 7 * HOUR_MS
            ),
            NOW
        )

        assertEquals("250 kcal over", result.calorieLine)
        assertEquals("2,250 of 2,000 kcal", result.consumedLine)
        assertEquals("Stale - 7 hr ago", result.statusLine)
        assertTrue(result.isStale)
    }

    @Test
    fun `handles partial cache without inventing values`() {
        val result = CalibrateTileFormatter.format(
            CalibrateTileSnapshot(
                caloriesConsumed = 400,
                calorieTarget = null,
                caloriesRemaining = null,
                cachedAtEpochMs = NOW + MINUTE_MS
            ),
            NOW
        )

        assertEquals("Calories --", result.calorieLine)
        assertEquals("Consumed / target --", result.consumedLine)
        assertEquals("Updated now", result.statusLine)
        assertFalse(result.isStale)
    }

    @Test
    fun `keeps a recent calorie cache fresh`() {
        val result = CalibrateTileFormatter.format(
            CalibrateTileSnapshot(
                caloriesConsumed = 1_000,
                calorieTarget = 2_000,
                caloriesRemaining = 1_000,
                cachedAtEpochMs = NOW - 2 * MINUTE_MS
            ),
            NOW
        )

        assertEquals("2 min ago", result.statusLine)
        assertFalse(result.isStale)
    }

    @Test
    fun `shows an explicit empty cache state`() {
        val result = CalibrateTileFormatter.format(null, NOW)

        assertEquals("Open calibrate", result.calorieLine)
        assertEquals("No cached data", result.statusLine)
        assertTrue(result.isStale)
    }

    @Test
    fun `shows paused instead of calorie progress`() {
        val result = CalibrateTileFormatter.format(
            CalibrateTileSnapshot(
                caloriesConsumed = 500,
                calorieTarget = 2_000,
                caloriesRemaining = 1_500,
                cachedAtEpochMs = NOW,
                foodDayStatus = "PAUSED"
            ),
            NOW
        )

        assertEquals("Paused", result.calorieLine)
        assertEquals("Calorie tracking paused", result.consumedLine)
        assertEquals("Open app to review", result.statusLine)
    }

    private companion object {
        const val NOW = 1_800_000_000_000L
        const val MINUTE_MS = 60_000L
        const val HOUR_MS = 60 * MINUTE_MS
    }
}
