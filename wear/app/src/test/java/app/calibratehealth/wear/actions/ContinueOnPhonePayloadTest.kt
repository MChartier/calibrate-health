package app.calibratehealth.wear.actions

import app.calibratehealth.wear.data.security.SecureSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ContinueOnPhonePayloadTest {
    @Test
    fun `payload is bound to protocol server user and local date`() {
        assertEquals(
            "{\"protocol_version\":1,\"server_origin\":\"https://health.example.com\"," +
                "\"user_id\":42,\"destination\":\"food_log\",\"local_date\":\"2026-07-12\"}",
            buildContinueOnPhonePayload(session(), "2026-07-12")
        )
    }

    @Test
    fun `payload rejects noncanonical dates`() {
        assertThrows(IllegalArgumentException::class.java) {
            buildContinueOnPhonePayload(session(), "2026-7-2")
        }
    }

    private fun session() = SecureSession(
        accessToken = "access",
        refreshToken = "refresh",
        userId = 42,
        serverOrigin = "https://health.example.com",
        watchDeviceId = "watch-1",
        accessExpiresAtEpochMs = 1_900_000_000_000,
        refreshExpiresAtEpochMs = 2_000_000_000_000
    )
}
