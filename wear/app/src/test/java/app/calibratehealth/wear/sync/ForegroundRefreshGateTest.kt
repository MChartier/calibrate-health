package app.calibratehealth.wear.sync

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ForegroundRefreshGateTest {
    @Test
    fun `coalesces cold start and immediate activity start`() {
        val gate = ForegroundRefreshGate(minimumIntervalMs = 60_000)

        assertTrue(gate.tryAcquire(1_000))
        assertFalse(gate.tryAcquire(1_001))
        assertTrue(gate.tryAcquire(61_000))
    }

    @Test
    fun `allows scheduling after elapsed clock reset`() {
        val gate = ForegroundRefreshGate(minimumIntervalMs = 60_000)

        assertTrue(gate.tryAcquire(100_000))
        assertTrue(gate.tryAcquire(5))
    }
}
