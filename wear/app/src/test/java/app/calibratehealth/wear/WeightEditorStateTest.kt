package app.calibratehealth.wear

import org.junit.Assert.assertEquals
import org.junit.Test

class WeightEditorStateTest {
    @Test
    fun `first weight starts from an explicit canonical gram default`() {
        val metric = WeightEditorState(70_000L, "kg")
        val imperial = WeightEditorState(70_000L, "lb")

        assertEquals(70_000L, metric.grams)
        assertEquals("70.0 kg", metric.label())
        assertEquals("154.3 lb", imperial.label())
    }

    @Test
    fun `metric editor steps in canonical hundred gram increments`() {
        val state = WeightEditorState(72_400, "kg").adjust(1)
        assertEquals(72_500, state.grams)
        assertEquals("72.5 kg", state.label())
    }

    @Test
    fun `imperial editor stays in canonical grams and clamps plausible bounds`() {
        assertEquals(72_445, WeightEditorState(72_400, "lb").adjust(1).grams)
        assertEquals(WeightEditorState.MIN_WEIGHT_GRAMS, WeightEditorState(20_000, "kg").adjust(-1).grams)
        assertEquals(WeightEditorState.MAX_WEIGHT_GRAMS, WeightEditorState(500_000, "kg").adjust(1).grams)
    }

    @Test
    fun `rotary input accumulates high resolution motion before changing weight`() {
        val partial = accumulateRotaryWeight(0f, 20f)
        assertEquals(0, partial.steps)

        val completed = accumulateRotaryWeight(partial.remainingPixels, 20f)
        assertEquals(1, completed.steps)
        assertEquals(4f, completed.remainingPixels, 0.001f)
    }

    @Test
    fun `rotary input supports both directions and bounds a single event`() {
        assertEquals(-1, accumulateRotaryWeight(0f, -40f).steps)
        assertEquals(5, accumulateRotaryWeight(0f, 10_000f).steps)
    }
}
