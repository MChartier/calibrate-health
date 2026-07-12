package app.calibratehealth.wear.pairing

import app.calibratehealth.wear.data.security.SecureSession
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

internal data class PairingExchangeRequest(
    val pairingToken: String,
    val serverOrigin: String,
    val watchDeviceId: String,
    val exchangeId: String,
    val challengeSignature: String
)

internal class PairingExchangeException(message: String) : IllegalStateException(message)

/** Exchanges once, with one identical transport retry so the backend can revoke a response-lost session. */
internal class WearPairingHttpClient {
    fun exchange(request: PairingExchangeRequest): SecureSession {
        val url = buildPairingExchangeUrl(request.serverOrigin)
        val requestBytes = JSONObject()
            .put("pairing_token", request.pairingToken)
            .put("server_origin", request.serverOrigin)
            .put("watch_device_id", request.watchDeviceId)
            .put("protocol_version", WEAR_PAIRING_PROTOCOL_VERSION)
            .put("exchange_id", request.exchangeId)
            .put("challenge_signature", request.challengeSignature)
            .toString()
            .toByteArray(Charsets.UTF_8)
        require(requestBytes.size <= MAX_PAIRING_MESSAGE_BYTES) { "Pairing exchange payload is too large." }

        repeat(2) { attempt ->
            try {
                return exchangeOnce(url, requestBytes, request.serverOrigin, request.watchDeviceId)
            } catch (error: PairingExchangeException) {
                // An HTTP response or invalid response body must never be retried.
                throw error
            } catch (error: IOException) {
                if (attempt == 1) {
                    throw PairingExchangeException("Pairing response was unavailable. Start pairing again.")
                }
                // Retry identical signed material once. If the server consumed the first request,
                // its PAIRING_RESPONSE_LOST response revokes the possibly orphaned session.
            }
        }
        throw PairingExchangeException("Pairing response was unavailable. Start pairing again.")
    }

    private fun exchangeOnce(
        url: String,
        requestBytes: ByteArray,
        serverOrigin: String,
        watchDeviceId: String
    ): SecureSession {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.instanceFollowRedirects = false
            connection.doOutput = true
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setFixedLengthStreamingMode(requestBytes.size)
            connection.outputStream.use { it.write(requestBytes) }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.use(::readBounded)?.toString(Charsets.UTF_8).orEmpty()
            val contentType = connection.contentType.orEmpty().lowercase()
            if (contentType.isNotEmpty() && !contentType.startsWith("application/json")) {
                throw PairingExchangeException("Pairing server returned an unsupported response.")
            }
            if (status != HttpURLConnection.HTTP_OK) {
                val errorCode = runCatching { JSONObject(body).optString("code") }.getOrNull()
                    ?.takeIf { it.matches(Regex("[A-Z0-9_]{1,64}")) }
                throw PairingExchangeException(
                    when (errorCode) {
                        "PAIRING_RESPONSE_LOST" -> "The pairing response was lost and revoked. Start pairing again."
                        "PAIRING_CREDENTIAL_EXPIRED" -> "The pairing request expired. Start pairing again."
                        else -> "Pairing was rejected by the server. Start pairing again."
                    }
                )
            }
            return parseSession(body, serverOrigin, watchDeviceId)
        } finally {
            connection.disconnect()
        }
    }

    private fun parseSession(body: String, serverOrigin: String, watchDeviceId: String): SecureSession {
        val json = runCatching { JSONObject(body) }.getOrElse {
            throw PairingExchangeException("Pairing server returned invalid JSON.")
        }
        val user = json.optJSONObject("user")
            ?: throw PairingExchangeException("Pairing response omitted the account.")
        val accessToken = (json.opt("access_token") as? String)?.takeIf { it.isNotBlank() && it.length <= 512 }
            ?: throw PairingExchangeException("Pairing response omitted the access token.")
        val refreshToken = (json.opt("refresh_token") as? String)?.takeIf { it.isNotBlank() && it.length <= 512 }
            ?: throw PairingExchangeException("Pairing response omitted the refresh token.")
        val userId = (user.opt("id") as? Number)?.toLong()?.takeIf { it > 0 }
            ?: throw PairingExchangeException("Pairing response contained an invalid account.")
        val accessExpiry = (json.opt("access_expires_at") as? String).toEpochMillis()
            ?: throw PairingExchangeException("Pairing response contained an invalid access expiry.")
        val refreshExpiry = (json.opt("refresh_expires_at") as? String).toEpochMillis()
            ?: throw PairingExchangeException("Pairing response contained an invalid refresh expiry.")
        if (accessExpiry <= System.currentTimeMillis() || refreshExpiry < accessExpiry) {
            throw PairingExchangeException("Pairing response contained invalid expiries.")
        }
        return SecureSession(
            accessToken = accessToken,
            refreshToken = refreshToken,
            userId = userId,
            serverOrigin = serverOrigin,
            watchDeviceId = watchDeviceId,
            accessExpiresAtEpochMs = accessExpiry,
            refreshExpiresAtEpochMs = refreshExpiry
        )
    }

    private fun readBounded(stream: java.io.InputStream): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(4_096)
        while (true) {
            val count = stream.read(buffer)
            if (count < 0) break
            if (output.size() + count > MAX_RESPONSE_BYTES) {
                throw PairingExchangeException("Pairing server response was too large.")
            }
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }

    private fun String?.toEpochMillis(): Long? {
        val value = this ?: return null
        return runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()?.takeIf { it > 0 }
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 8_000
        const val READ_TIMEOUT_MS = 10_000
        const val MAX_RESPONSE_BYTES = 64 * 1024
    }
}
