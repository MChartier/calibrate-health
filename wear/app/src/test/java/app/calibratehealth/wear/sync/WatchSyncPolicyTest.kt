package app.calibratehealth.wear.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class WatchSyncPolicyTest {
    @Test
    fun `status classification distinguishes conflict retry and permanent failures`() {
        assertEquals(HttpOutcome.SUCCESS, classifyWatchHttpStatus(200))
        assertEquals(HttpOutcome.NOT_MODIFIED, classifyWatchHttpStatus(304))
        assertEquals(HttpOutcome.CONFLICT, classifyWatchHttpStatus(409))
        assertEquals(HttpOutcome.RETRYABLE, classifyWatchHttpStatus(429))
        assertEquals(HttpOutcome.RETRYABLE, classifyWatchHttpStatus(503))
        assertEquals(HttpOutcome.PERMANENT, classifyWatchHttpStatus(400))
        assertEquals(HttpOutcome.PERMANENT, classifyWatchHttpStatus(403))
    }

    @Test
    fun `only explicit operation in progress conflict remains retryable`() {
        assertEquals(
            MutationSendResult.Retryable("Operation is already in progress"),
            classifyConflict("{\"message\":\"Operation is already in progress\",\"code\":\"OPERATION_IN_PROGRESS\",\"retryable\":true}")
        )
        assertEquals(
            MutationSendResult.Conflict("Weight changed"),
            classifyConflict("{\"message\":\"Weight changed\",\"code\":\"ENTITY_CONFLICT\",\"retryable\":false}")
        )
    }
}
