package app.calibratehealth.wear

import java.util.Locale
import kotlin.math.roundToInt

/** Cached, account-scoped health state rendered by the watch without waiting for the network. */
data class WearSummary(
    val localDate: String,
    val caloriesRemaining: Int?,
    val caloriesConsumed: Int?,
    val calorieTarget: Int?,
    val steps: Int?,
    val activityCalories: Int?,
    val activityStale: Boolean,
    val activityAgeSeconds: Long?,
    val foodDayComplete: Boolean,
    val foodDayRevision: String?,
    val todayWeightGrams: Long?,
    val todayWeightRevision: String?,
    val latestWeightGrams: Long?,
    val latestWeightDate: String?,
    val weightUnit: String,
    val undoFoodLogId: Long?,
    val undoName: String?,
    val undoCalories: Int?,
    val fetchedAtEpochMs: Long,
    val lastSyncAtEpochMs: Long?
) {
    val editableWeightGrams: Long? get() = todayWeightGrams ?: latestWeightGrams
    val hasUndoCandidate: Boolean
        get() = undoFoodLogId != null && !undoName.isNullOrBlank() && undoCalories != null
}

sealed interface WearAppState {
    data object Unpaired : WearAppState
    data object Pairing : WearAppState
    data class PairingError(val message: String) : WearAppState
    data class UpgradeRequired(val message: String) : WearAppState
    data class Paired(
        val userId: Long,
        val serverOrigin: String,
        val confirmationPending: Boolean = false
    ) : WearAppState
    data class Ready(val summary: WearSummary) : WearAppState
}

sealed interface WearSyncStatus {
    data object Idle : WearSyncStatus
    data class Pending(val count: Int) : WearSyncStatus
    data class Error(val message: String) : WearSyncStatus
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

    fun steps(summary: WearSummary): String = summary.steps?.let(::formatWholeNumber) ?: "--"

    fun activity(summary: WearSummary): String {
        val calories = summary.activityCalories?.let { "$it active kcal" }
        val stale = if (summary.activityStale) "Activity may be stale" else null
        return listOfNotNull(calories, stale).joinToString(" | ").ifBlank { "Activity unavailable" }
    }

    fun completion(summary: WearSummary): String =
        if (summary.foodDayComplete) "Food day complete" else "Food day in progress"

    fun weight(grams: Long?, unit: String): String {
        if (grams == null) return "--"
        return if (unit.lowercase(Locale.US) == "lb") {
            String.format(Locale.US, "%.1f lb", grams / GRAMS_PER_POUND)
        } else {
            String.format(Locale.US, "%.1f kg", grams / GRAMS_PER_KILOGRAM)
        }
    }

    fun sync(status: WearSyncStatus, lastSyncAtEpochMs: Long?): String = when (status) {
        WearSyncStatus.Idle -> if (lastSyncAtEpochMs == null) "Waiting for first sync" else "Synced"
        is WearSyncStatus.Pending -> "${status.count} change${if (status.count == 1) "" else "s"} pending"
        is WearSyncStatus.Error -> status.message
    }

    private fun formatWholeNumber(value: Int): String =
        String.format(Locale.US, "%,d", value)

    private const val GRAMS_PER_KILOGRAM = 1_000.0
    private const val GRAMS_PER_POUND = 453.59237
}

/** Canonical gram editor keeps unit conversion at the display edge. */
data class WeightEditorState(val grams: Long, val unit: String) {
    fun adjust(direction: Int): WeightEditorState {
        val step = if (unit.lowercase(Locale.US) == "lb") IMPERIAL_STEP_GRAMS else METRIC_STEP_GRAMS
        return copy(grams = (grams + (step * direction)).coerceIn(MIN_WEIGHT_GRAMS, MAX_WEIGHT_GRAMS))
    }

    fun label(): String = SummaryFormatter.weight(grams, unit)

    companion object {
        // A neutral starting point lets a first-time user log locally without inventing profile data.
        const val DEFAULT_FIRST_WEIGHT_GRAMS = 70_000L
        const val MIN_WEIGHT_GRAMS = 20_000L
        const val MAX_WEIGHT_GRAMS = 500_000L
        private const val METRIC_STEP_GRAMS = 100L
        // 0.1 lb rounded to whole grams, which is the API's canonical storage unit.
        private val IMPERIAL_STEP_GRAMS = (45.359237).roundToInt().toLong()
    }
}

data class RotaryWeightChange(val remainingPixels: Float, val steps: Int)

/** Accumulates high-resolution crown motion into bounded, intentional weight steps. */
fun accumulateRotaryWeight(currentPixels: Float, deltaPixels: Float): RotaryWeightChange {
    val total = currentPixels + deltaPixels
    if (!total.isFinite()) return RotaryWeightChange(0f, 0)
    val rawSteps = (total / ROTARY_WEIGHT_STEP_PIXELS).toInt()
    return RotaryWeightChange(
        remainingPixels = total % ROTARY_WEIGHT_STEP_PIXELS,
        steps = rawSteps.coerceIn(-MAX_ROTARY_WEIGHT_STEPS_PER_EVENT, MAX_ROTARY_WEIGHT_STEPS_PER_EVENT)
    )
}

// Prevents a high-resolution crown from changing weight on incidental movement.
private const val ROTARY_WEIGHT_STEP_PIXELS = 36f
private const val MAX_ROTARY_WEIGHT_STEPS_PER_EVENT = 5
