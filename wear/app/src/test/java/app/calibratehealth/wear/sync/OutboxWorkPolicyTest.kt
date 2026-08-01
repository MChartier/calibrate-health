package app.calibratehealth.wear.sync

import androidx.work.ExistingWorkPolicy
import org.junit.Assert.assertEquals
import org.junit.Test

class OutboxWorkPolicyTest {
    @Test
    fun `ordered work appends to preserve FIFO mutations`() {
        assertEquals(
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            existingWorkPolicy(OutboxEnqueueMode.ORDERED)
        )
    }

    @Test
    fun `authoritative refresh replaces stale retry chains`() {
        assertEquals(
            ExistingWorkPolicy.REPLACE,
            existingWorkPolicy(OutboxEnqueueMode.AUTHORITATIVE_REFRESH)
        )
    }
}
