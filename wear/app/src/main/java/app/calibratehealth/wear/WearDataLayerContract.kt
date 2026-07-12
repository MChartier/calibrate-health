package app.calibratehealth.wear

/** Versioned coordination paths shared by the future phone and watch Data Layer adapters. */
object WearDataLayerContract {
    const val PAIR_HELLO = "/calibrate/v1/pair/hello"
    const val PAIR_CREDENTIAL = "/calibrate/v1/pair/credential"
    const val PAIR_RESULT = "/calibrate/v1/pair/result"
    const val SYNC_INVALIDATE = "/calibrate/v1/sync/invalidate"
    const val CONTINUE_ON_PHONE = "/calibrate/v1/continue-on-phone"

    fun supports(path: String): Boolean =
        path == PAIR_HELLO ||
            path == PAIR_CREDENTIAL ||
            path == PAIR_RESULT ||
            path == SYNC_INVALIDATE ||
            path == CONTINUE_ON_PHONE
}
