package app.calibratehealth.wear.actions

import android.content.Context
import app.calibratehealth.wear.WearDataLayerContract
import app.calibratehealth.wear.data.security.AndroidKeystoreTokenStore
import app.calibratehealth.wear.data.security.SecureSession
import com.google.android.gms.wearable.Wearable
import java.nio.charset.StandardCharsets
import java.time.LocalDate
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

fun interface ContinueOnPhoneMessenger {
    fun send(localDate: String, onResult: (Result<Unit>) -> Unit)
}

/** Data Layer is used only to ask the paired phone to open a richer logging surface. */
class DataLayerContinueOnPhoneMessenger(context: Context) : ContinueOnPhoneMessenger {
    private val nodeClient = Wearable.getNodeClient(context.applicationContext)
    private val messageClient = Wearable.getMessageClient(context.applicationContext)
    private val tokenStore = AndroidKeystoreTokenStore(context.applicationContext)

    override fun send(localDate: String, onResult: (Result<Unit>) -> Unit) {
        val session = runCatching { tokenStore.read() }.getOrNull()
        if (session == null) {
            onResult(Result.failure(IllegalStateException("Pair the watch before continuing on the phone.")))
            return
        }
        val payload = runCatching {
            buildContinueOnPhonePayload(session, localDate).toByteArray(StandardCharsets.UTF_8)
        }.getOrElse { error ->
            onResult(Result.failure(error))
            return
        }
        nodeClient.connectedNodes
            .addOnFailureListener { onResult(Result.failure(it)) }
            .addOnSuccessListener { nodes ->
                if (nodes.isEmpty()) {
                    onResult(Result.failure(IllegalStateException("No connected phone.")))
                    return@addOnSuccessListener
                }
                val completed = AtomicBoolean(false)
                val remaining = AtomicInteger(nodes.size)
                nodes.forEach { node ->
                    messageClient.sendMessage(node.id, WearDataLayerContract.CONTINUE_ON_PHONE, payload)
                        .addOnSuccessListener {
                            if (completed.compareAndSet(false, true)) onResult(Result.success(Unit))
                        }
                        .addOnFailureListener { error ->
                            if (remaining.decrementAndGet() == 0 && completed.compareAndSet(false, true)) {
                                onResult(Result.failure(error))
                            }
                        }
                }
            }
    }

}

/** Exact phone contract; binding the account prevents cross-scope handoff consumption. */
internal fun buildContinueOnPhonePayload(session: SecureSession, localDate: String): String {
    val parsedDate = runCatching { LocalDate.parse(localDate) }.getOrNull()
    require(parsedDate?.toString() == localDate) { "Handoff date must use YYYY-MM-DD." }
    return "{" +
        "\"protocol_version\":1," +
        "\"server_origin\":${jsonString(session.serverOrigin)}," +
        "\"user_id\":${session.userId}," +
        "\"destination\":\"food_log\"," +
        "\"local_date\":${jsonString(localDate)}" +
        "}"
}

private fun jsonString(value: String): String = buildString {
    append('"')
    value.forEach { character ->
        when (character) {
            '"' -> append("\\\"")
            '\\' -> append("\\\\")
            '\b' -> append("\\b")
            '\u000c' -> append("\\f")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            else -> if (character.code < 0x20) append("\\u%04x".format(character.code)) else append(character)
        }
    }
    append('"')
}
