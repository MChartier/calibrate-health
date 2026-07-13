package app.calibratehealth.wear.pairing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PairingUiStateTest {
    private val session = PairingSessionFacts(
        userId = 42,
        serverOrigin = "https://health.example.com",
        refreshExpiresAtEpochMs = 2_000
    )

    @Test
    fun `refresh-expired session requires re-pair without representing it as unpaired`() {
        val state = resolvePairingUiState(
            storedError = null,
            hasPendingPairing = false,
            session = session,
            confirmationPending = false,
            nowEpochMs = 2_000
        )

        assertEquals(PairingUiState.Error(SESSION_RECOVERY_MESSAGE), state)
        assertTrue((state as PairingUiState.Error).message.contains("queued changes will be preserved"))
    }

    @Test
    fun `valid refresh session remains paired and preserves confirmation status`() {
        assertEquals(
            PairingUiState.Paired(42, "https://health.example.com", confirmationPending = true),
            resolvePairingUiState(
                storedError = null,
                hasPendingPairing = false,
                session = session,
                confirmationPending = true,
                nowEpochMs = 1_999
            )
        )
    }

    @Test
    fun `new pending pairing takes precedence over an expired session`() {
        assertEquals(
            PairingUiState.Pairing,
            resolvePairingUiState(
                storedError = null,
                hasPendingPairing = true,
                session = session,
                confirmationPending = false,
                nowEpochMs = 2_000
            )
        )
    }

    @Test
    fun `paired and upgrade-required states can probe for compatibility recovery`() {
        assertTrue(PairingUiState.Paired(42, "https://health.example.com", false).shouldAttemptForegroundSync())
        assertTrue(PairingUiState.UpgradeRequired("Update this watch.").shouldAttemptForegroundSync())
        assertEquals(false, PairingUiState.Unpaired.shouldAttemptForegroundSync())
        assertEquals(false, PairingUiState.Error("Pair again.").shouldAttemptForegroundSync())
    }
}
