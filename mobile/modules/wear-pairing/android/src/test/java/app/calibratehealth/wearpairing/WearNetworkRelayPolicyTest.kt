package app.calibratehealth.wearpairing

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WearNetworkRelayPolicyTest {
    @Test
    fun `allows only fixed Watch server operations`() {
        assertTrue(WearNetworkRelayPolicy.supports("POST", WearNetworkRelayPolicy.PAIRING_EXCHANGE_PATH))
        assertTrue(WearNetworkRelayPolicy.supports("POST", WearNetworkRelayPolicy.SESSION_REFRESH_PATH))
        assertTrue(WearNetworkRelayPolicy.supports("GET", WearNetworkRelayPolicy.WATCH_SNAPSHOT_PATH))
        assertTrue(WearNetworkRelayPolicy.supports("POST", WearNetworkRelayPolicy.WATCH_MUTATION_PATH))
        assertFalse(WearNetworkRelayPolicy.supports("POST", WearNetworkRelayPolicy.WATCH_SNAPSHOT_PATH))
        assertFalse(WearNetworkRelayPolicy.supports("GET", WearNetworkRelayPolicy.SESSION_REFRESH_PATH))
        assertFalse(WearNetworkRelayPolicy.supports("GET", "/api/v1/users"))
    }

    @Test
    fun `allows only headers required by the fixed operations`() {
        assertTrue(WearNetworkRelayPolicy.supportsHeader("Authorization"))
        assertTrue(WearNetworkRelayPolicy.supportsHeader("if-none-match"))
        assertTrue(WearNetworkRelayPolicy.supportsHeader("X-Calibrate-Client-Version"))
        assertTrue(WearNetworkRelayPolicy.supportsHeader("X-Client-Operation-Id"))
        assertFalse(WearNetworkRelayPolicy.supportsHeader("Cookie"))
        assertFalse(WearNetworkRelayPolicy.supportsHeader("Host"))
        assertFalse(WearNetworkRelayPolicy.supportsHeader("X-Forwarded-Host"))
    }

    @Test
    fun `accepts the bounded authenticated snapshot headers`() {
        assertTrue(
            WearNetworkRelayPolicy.hasValidHeaders(
                WearNetworkRelayPolicy.WATCH_SNAPSHOT_PATH,
                mapOf(
                    "Authorization" to "Bearer access",
                    "If-None-Match" to "W/\"watch-1\"",
                    "X-Calibrate-Client-Platform" to "wear_os",
                    "X-Calibrate-Client-Version" to "0.2.4"
                )
            )
        )
    }

    @Test
    fun `rejects empty bearer tokens and mutation-only headers on snapshots`() {
        val base = mapOf(
            "X-Calibrate-Client-Platform" to "wear_os",
            "X-Calibrate-Client-Version" to "0.2.4"
        )

        assertFalse(
            WearNetworkRelayPolicy.hasValidHeaders(
                WearNetworkRelayPolicy.WATCH_SNAPSHOT_PATH,
                base + ("Authorization" to "Bearer ")
            )
        )
        assertFalse(
            WearNetworkRelayPolicy.hasValidHeaders(
                WearNetworkRelayPolicy.WATCH_SNAPSHOT_PATH,
                base + mapOf(
                    "Authorization" to "Bearer access",
                    "X-Client-Operation-Id" to "operation-123"
                )
            )
        )
    }

    @Test
    fun `rejects arbitrary headers at the phone trust boundary`() {
        val headers = mapOf(
            "Authorization" to "Bearer access",
            "Cookie" to "session=phone",
            "X-Calibrate-Client-Platform" to "wear_os",
            "X-Calibrate-Client-Version" to "0.2.4"
        )

        assertFalse(WearNetworkRelayPolicy.hasValidHeaders(WearNetworkRelayPolicy.WATCH_SNAPSHOT_PATH, headers))
    }
}
