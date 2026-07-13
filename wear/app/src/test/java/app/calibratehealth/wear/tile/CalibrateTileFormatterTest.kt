package app.calibratehealth.wear.tile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CalibrateTileFormatterTest {
    @Test
    fun `formats remaining calories steps and completion`() {
        val result = CalibrateTileFormatter.format(
            CalibrateTileSnapshot(
                caloriesConsumed = 1_500,
                calorieTarget = 2_000,
                caloriesRemaining = 500,
                steps = 12_345,
                activityStale = false,
                isComplete = true,
                cachedAtEpochMs = NOW - 5 * MINUTE_MS
            ),
            NOW
        )

        assertEquals("500 kcal left", result.calorieLine)
        assertEquals("12,345 steps", result.stepsLine)
        assertEquals("Day complete | 5 min ago", result.statusLine)
        assertFalse(result.isStale)
    }

    @Test
    fun `formats calories over and marks old cache stale`() {
        val result = CalibrateTileFormatter.format(
            CalibrateTileSnapshot(
                caloriesConsumed = 2_250,
                calorieTarget = 2_000,
                caloriesRemaining = -250,
                steps = null,
                activityStale = false,
                isComplete = false,
                cachedAtEpochMs = NOW - 7 * HOUR_MS
            ),
            NOW
        )

        assertEquals("250 kcal over", result.calorieLine)
        assertNull(result.stepsLine)
        assertEquals("Day open | Stale - 7 hr ago", result.statusLine)
        assertTrue(result.isStale)
    }

    @Test
    fun `handles partial cache without inventing values`() {
        val result = CalibrateTileFormatter.format(
            CalibrateTileSnapshot(
                caloriesConsumed = 400,
                calorieTarget = null,
                caloriesRemaining = null,
                steps = null,
                activityStale = false,
                isComplete = null,
                cachedAtEpochMs = NOW + MINUTE_MS
            ),
            NOW
        )

        assertEquals("Calories --", result.calorieLine)
        assertEquals("Updated now", result.statusLine)
        assertFalse(result.isStale)
    }

    @Test
    fun `marks stale activity even when the snapshot cache is recent`() {
        val result = CalibrateTileFormatter.format(
            CalibrateTileSnapshot(
                caloriesConsumed = 1_000,
                calorieTarget = 2_000,
                caloriesRemaining = 1_000,
                steps = 4_000,
                activityStale = true,
                isComplete = false,
                cachedAtEpochMs = NOW - 2 * MINUTE_MS
            ),
            NOW
        )

        assertEquals("Day open | Steps stale - 2 min ago", result.statusLine)
        assertTrue(result.isStale)
    }

    @Test
    fun `shows an explicit empty cache state`() {
        val result = CalibrateTileFormatter.format(null, NOW)

        assertEquals("Open calibrate", result.calorieLine)
        assertEquals("No cached data", result.statusLine)
        assertTrue(result.isStale)
    }

    private companion object {
        const val NOW = 1_800_000_000_000L
        const val MINUTE_MS = 60_000L
        const val HOUR_MS = 60 * MINUTE_MS
    }
}
