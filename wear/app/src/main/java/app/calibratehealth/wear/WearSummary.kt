package app.calibratehealth.wear

/** Glanceable state rendered before network-backed watch synchronization lands. */
data class WearSummary(
    val caloriesRemaining: Int?,
    val caloriesConsumed: Int?,
    val calorieTarget: Int?,
    val steps: Int?,
    val latestWeight: String?,
    val isSynced: Boolean
)

sealed interface WearAppState {
    data object Unpaired : WearAppState

    data object Pairing : WearAppState

    data class PairingError(val message: String) : WearAppState

    data class Paired(
        val userId: Long,
        val serverOrigin: String,
        val confirmationPending: Boolean = false
    ) : WearAppState

    data class Ready(val summary: WearSummary) : WearAppState
}

object SummaryFormatter {
    fun caloriesRemaining(summary: WearSummary): String =
        summary.caloriesRemaining?.let { value ->
            if (value >= 0) "$value kcal left" else "${-value} kcal over"
        } ?: "Calorie target unavailable"

    fun calorieProgress(summary: WearSummary): String =
        if (summary.caloriesConsumed != null && summary.calorieTarget != null) {
            "${summary.caloriesConsumed} of ${summary.calorieTarget} kcal"
        } else {
            "Open phone to finish setup"
        }

    fun steps(summary: WearSummary): String = summary.steps?.toString() ?: "--"
}
