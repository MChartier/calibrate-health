package app.calibratehealth.wearpairing

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WearPairingProtocolTest {
    @Test
    fun `allows the exact account cleanup request and result paths`() {
        assertTrue(WearPairingProtocol.isAllowed(WearPairingProtocol.ACCOUNT_DISCONNECT))
        assertTrue(WearPairingProtocol.isAllowed(WearPairingProtocol.ACCOUNT_DISCONNECT_RESULT))
        assertFalse(WearPairingProtocol.isAllowed("${WearPairingProtocol.ACCOUNT_DISCONNECT_RESULT}/other"))
    }

    @Test
    fun `keeps native network relay paths out of the JavaScript bridge`() {
        assertFalse(WearPairingProtocol.isAllowed(WearPairingProtocol.NETWORK_REQUEST))
        assertFalse(WearPairingProtocol.isAllowed(WearPairingProtocol.NETWORK_RESPONSE))
        assertFalse(WearPairingProtocol.isAllowed("${WearPairingProtocol.NETWORK_REQUEST}/other"))
    }
}
