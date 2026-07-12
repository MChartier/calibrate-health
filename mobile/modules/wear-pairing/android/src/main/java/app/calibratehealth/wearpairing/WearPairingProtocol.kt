package app.calibratehealth.wearpairing

internal object WearPairingProtocol {
    const val CAPABILITY = "calibrate_wear_pairing_v1"
    const val PAIR_HELLO = "/calibrate/v1/pair/hello"
    const val PAIR_CREDENTIAL = "/calibrate/v1/pair/credential"
    const val PAIR_RESULT = "/calibrate/v1/pair/result"
    const val SYNC_INVALIDATE = "/calibrate/v1/sync/invalidate"
    const val CONTINUE_ON_PHONE = "/calibrate/v1/continue-on-phone"
    const val MAX_MESSAGE_BYTES = 32 * 1024

    private val allowedPaths = setOf(
        PAIR_HELLO,
        PAIR_CREDENTIAL,
        PAIR_RESULT,
        SYNC_INVALIDATE,
        CONTINUE_ON_PHONE
    )

    fun isAllowed(path: String): Boolean = path in allowedPaths
}
