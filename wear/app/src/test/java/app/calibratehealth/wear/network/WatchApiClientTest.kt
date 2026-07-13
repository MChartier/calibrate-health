package app.calibratehealth.wear.network

import app.calibratehealth.wear.data.security.AccountDataStore
import app.calibratehealth.wear.data.security.AccountSessionCoordinator
import app.calibratehealth.wear.data.security.SecureSession
import app.calibratehealth.wear.data.security.SecureTokenStore
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchApiClientTest {
    @Test
    fun `fixed endpoint URL rejects query and authority replacement`() {
        assertEquals(
            "https://health.example.com/api/v1/watch",
            AuthenticatedWatchApi.endpointUrl("https://health.example.com", "/api/v1/watch")
        )
        assertTrue(runCatching {
            AuthenticatedWatchApi.endpointUrl("https://health.example.com", "//attacker.example/path")
        }.isFailure)
        assertTrue(runCatching {
            AuthenticatedWatchApi.endpointUrl("https://health.example.com", "/api/v1/watch?redirect=true")
        }.isFailure)
    }

    @Test
    fun `mutation request carries stable operation id and wraps payload once`() = runBlocking {
        val store = MemoryTokenStore(session())
        var captured: WatchHttpRequest? = null
        val api = AuthenticatedWatchApi(
            tokenStore = store,
            sessionCoordinator = coordinator(store),
            transport = WatchHttpTransport { request ->
                captured = request
                WatchHttpResponse(200, emptyMap(), "{}")
            },
            nowEpochMs = { 1_000L }
        )

        val result = api.postMutation(
            session = store.value!!,
            operationId = "operation-1234",
            mutationType = "food.create",
            payloadJson = "{\"date\":\"2026-07-11\",\"name\":\"Apple\",\"calories\":95}"
        )

        assertTrue(result is AuthenticatedApiResult.Response)
        assertEquals("POST", captured?.method)
        assertEquals("operation-1234", captured?.headers?.get("X-Client-Operation-Id"))
        assertEquals("Bearer access", captured?.headers?.get("Authorization"))
        assertEquals(
            "{\"type\":\"food.create\",\"payload\":{\"date\":\"2026-07-11\",\"name\":\"Apple\",\"calories\":95}}",
            captured?.body
        )
    }

    @Test
    fun `expired access token refreshes and persists rotated same-account session`() = runBlocking {
        val store = MemoryTokenStore(session().copy(accessExpiresAtEpochMs = 1_001L))
        val requests = mutableListOf<WatchHttpRequest>()
        val api = AuthenticatedWatchApi(
            tokenStore = store,
            sessionCoordinator = coordinator(store),
            transport = WatchHttpTransport { request ->
                requests += request
                if (request.url.endsWith("/auth/mobile/refresh")) {
                    WatchHttpResponse(
                        200,
                        emptyMap(),
                        """{"user":{"id":7},"access_token":"rotated-access","refresh_token":"rotated-refresh","access_expires_at":"2026-07-11T02:00:00Z","refresh_expires_at":"2026-08-11T02:00:00Z"}"""
                    )
                } else {
                    WatchHttpResponse(304, mapOf("ETag" to "W/\"watch-abc\""), "")
                }
            },
            nowEpochMs = { 1_000L }
        )

        api.getSnapshot(store.value!!, "W/\"watch-old\"")

        assertEquals(2, requests.size)
        assertEquals("rotated-access", store.value?.accessToken)
        assertEquals("rotated-refresh", store.value?.refreshToken)
        assertEquals("Bearer rotated-access", requests.last().headers["Authorization"])
        assertEquals("W/\"watch-old\"", requests.last().headers["If-None-Match"])
    }

    @Test
    fun `second unauthorized response after forced refresh requires pairing`() = runBlocking {
        val store = MemoryTokenStore(session())
        var refreshCount = 0
        val api = AuthenticatedWatchApi(
            tokenStore = store,
            sessionCoordinator = coordinator(store),
            transport = WatchHttpTransport { request ->
                if (request.url.endsWith("/auth/mobile/refresh")) {
                    refreshCount++
                    WatchHttpResponse(
                        200,
                        emptyMap(),
                        """{"user":{"id":7},"access_token":"rotated-access","refresh_token":"rotated-refresh","access_expires_at":"2026-07-11T02:00:00Z","refresh_expires_at":"2026-08-11T02:00:00Z"}"""
                    )
                } else {
                    WatchHttpResponse(401, emptyMap(), "{\"message\":\"Unauthorized\"}")
                }
            },
            nowEpochMs = { 1_000L }
        )

        val result = api.getSnapshot(store.value!!, null)

        assertEquals(1, refreshCount)
        assertTrue(result is AuthenticatedApiResult.AuthenticationRequired)
    }

    private fun session() = SecureSession(
        accessToken = "access",
        refreshToken = "refresh",
        userId = 7,
        serverOrigin = "https://health.example.com",
        watchDeviceId = "watch-7",
        accessExpiresAtEpochMs = 9_999_999_999_999,
        refreshExpiresAtEpochMs = 9_999_999_999_999
    )

    private fun coordinator(store: SecureTokenStore) = AccountSessionCoordinator(
        tokenStore = store,
        accountDataStore = AccountDataStore { }
    )

    private class MemoryTokenStore(var value: SecureSession?) : SecureTokenStore {
        override fun read(): SecureSession? = value
        override fun write(session: SecureSession) { value = session }
        override fun clear() { value = null }
    }
}
