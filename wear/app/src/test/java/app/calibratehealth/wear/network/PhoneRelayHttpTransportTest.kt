package app.calibratehealth.wear.network

import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneRelayHttpTransportTest {
    private val target = PhoneRelayTarget("phone-node", "https://health.example.com")

    @Test
    fun `relays a fixed Watch request to the exact paired phone and parses its response`() = runBlocking {
        var capturedPayload = ""
        val transport = PhoneRelayWatchHttpTransport(
            targetResolver = PhoneRelayTargetResolver { target },
            messenger = PhoneRelayMessenger { resolvedTarget, requestId, payload ->
                assertEquals(target, resolvedTarget)
                capturedPayload = payload
                StrictJson.stringify(
                    StrictJson.objectOf(
                        "kind" to StrictJson.string("phone_http_response"),
                        "protocol_version" to StrictJson.number(1),
                        "request_id" to StrictJson.string(requestId),
                        "server_origin" to StrictJson.string(target.serverOrigin),
                        "ok" to StrictJson.boolean(true),
                        "status" to StrictJson.number(304),
                        "headers" to JsonValue.Object(mapOf("ETag" to StrictJson.string("W/\"watch-1\""))),
                        "body" to StrictJson.string("")
                    )
                )
            }
        )

        val response = transport.execute(
            WatchHttpRequest(
                method = "GET",
                url = "https://health.example.com/api/v1/watch",
                headers = mapOf(
                    "Authorization" to "Bearer access",
                    "X-Calibrate-Client-Platform" to "wear_os",
                    "X-Calibrate-Client-Version" to "0.2.4",
                    "If-None-Match" to "W/\"watch-old\""
                )
            )
        )

        assertEquals(304, response.status)
        assertEquals("W/\"watch-1\"", response.header("ETag"))
        val request = StrictJson.parse(capturedPayload).requireObject("relay request")
        assertEquals("https://health.example.com", request.requiredString("server_origin"))
        assertEquals("/api/v1/watch", request.requiredString("path"))
        assertEquals("GET", request.requiredString("method"))
        assertTrue(request.required("body") is JsonValue.Null)
    }

    @Test
    fun `rejects arbitrary paths before sending anything to the phone`() = runBlocking {
        var sent = false
        val transport = PhoneRelayWatchHttpTransport(
            targetResolver = PhoneRelayTargetResolver { target },
            messenger = PhoneRelayMessenger { _, _, _ ->
                sent = true
                error("must not send")
            }
        )

        assertTrue(runCatching {
            transport.execute(WatchHttpRequest("GET", "https://health.example.com/api/v1/users"))
        }.isFailure)
        assertTrue(!sent)
    }

    @Test
    fun `falls back to direct transport only when the phone relay is unavailable`() = runBlocking {
        var directRequests = 0
        val transport = PhoneFirstWatchHttpTransport(
            phoneRelay = WatchHttpTransport { throw IOException("phone unavailable") },
            directFallback = WatchHttpTransport {
                directRequests += 1
                WatchHttpResponse(200, emptyMap(), "{}")
            }
        )

        val response = transport.execute(WatchHttpRequest("GET", "https://health.example.com/api/v1/watch"))

        assertEquals(200, response.status)
        assertEquals(1, directRequests)
    }

    @Test
    fun `surfaces a correlated phone relay failure as retryable IO`() = runBlocking {
        val transport = PhoneRelayWatchHttpTransport(
            targetResolver = PhoneRelayTargetResolver { target },
            messenger = PhoneRelayMessenger { _, requestId, _ ->
                StrictJson.stringify(
                    StrictJson.objectOf(
                        "kind" to StrictJson.string("phone_http_response"),
                        "protocol_version" to StrictJson.number(1),
                        "request_id" to StrictJson.string(requestId),
                        "server_origin" to StrictJson.string(target.serverOrigin),
                        "ok" to StrictJson.boolean(false),
                        "error_code" to StrictJson.string("PHONE_NETWORK_UNAVAILABLE"),
                        "message" to StrictJson.string("The paired phone could not reach the Calibrate server.")
                    )
                )
            }
        )

        val error = runCatching {
            transport.execute(WatchHttpRequest("GET", "https://health.example.com/api/v1/watch"))
        }.exceptionOrNull()
        assertTrue(error is IOException)
        assertTrue(error?.message?.contains("paired phone") == true)
    }
}
