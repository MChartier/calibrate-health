package app.calibratehealth.wear

import org.junit.Assert.assertEquals
import org.junit.Test

class SummaryFormatterTest {
    @Test
    fun `formats calorie balance without changing its sign meaning`() {
        val base = WearSummary(null, 1_360, 2_000, null, null, false)
        assertEquals("640 kcal left", SummaryFormatter.caloriesRemaining(base.copy(caloriesRemaining = 640)))
        assertEquals("125 kcal over", SummaryFormatter.caloriesRemaining(base.copy(caloriesRemaining = -125)))
        assertEquals("1360 of 2000 kcal", SummaryFormatter.calorieProgress(base))
    }

    @Test
    fun `uses explicit placeholders for unavailable glance data`() {
        val empty = WearSummary(null, null, null, null, null, false)
        assertEquals("Calorie target unavailable", SummaryFormatter.caloriesRemaining(empty))
        assertEquals("Open phone to finish setup", SummaryFormatter.calorieProgress(empty))
        assertEquals("--", SummaryFormatter.steps(empty))
    }
}
