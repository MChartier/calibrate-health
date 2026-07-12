package app.calibratehealth.wear.data.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ServerOriginPolicyTest {
    @Test
    fun `accepts https and private development origins`() {
        assertEquals(
            "https://health.example.com",
            ServerOriginPolicy.requireSafeOrigin("https://health.example.com")
        )
        assertEquals(
            "http://192.168.1.10:3000",
            ServerOriginPolicy.requireSafeOrigin("http://192.168.1.10:3000")
        )
        assertEquals(
            "http://calibrate.local:3000",
            ServerOriginPolicy.requireSafeOrigin("http://calibrate.local:3000")
        )
    }

    @Test
    fun `rejects public cleartext and non-origin urls`() {
        assertThrows(IllegalArgumentException::class.java) {
            ServerOriginPolicy.requireSafeOrigin("http://health.example.com")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerOriginPolicy.requireSafeOrigin("https://health.example.com/path")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerOriginPolicy.requireSafeOrigin("https://user@health.example.com")
        }
    }
}
