package app.calibratehealth.wear.tile

import kotlin.math.abs

data class CalibrateTileSnapshot(
    val caloriesConsumed: Int?,
    val calorieTarget: Int?,
    val caloriesRemaining: Int?,
    val steps: Int?,
    val activityStale: Boolean?,
    val isComplete: Boolean?,
    val cachedAtEpochMs: Long
)

data class CalibrateTileContent(
    val calorieLine: String,
    val stepsLine: String?,
    val statusLine: String,
    val isStale: Boolean
)

/** Formats the deliberately small, glanceable subset rendered by the cache-only Tile. */
object CalibrateTileFormatter {
    private const val MINUTE_MS = 60_000L
    private const val HOUR_MS = 60 * MINUTE_MS
    private const val DAY_MS = 24 * HOUR_MS
    private const val STALE_AFTER_MS = 6 * HOUR_MS

    fun format(snapshot: CalibrateTileSnapshot?, nowEpochMs: Long): CalibrateTileContent {
        if (snapshot == null) {
            return CalibrateTileContent(
                calorieLine = "Open calibrate",
                stepsLine = null,
                statusLine = "No cached data",
                isStale = true
            )
        }

        val calories = calorieLine(
            snapshot.caloriesConsumed,
            snapshot.calorieTarget,
            snapshot.caloriesRemaining
        )
        val ageMs = (nowEpochMs - snapshot.cachedAtEpochMs).coerceAtLeast(0L)
        val cacheIsStale = ageMs >= STALE_AFTER_MS
        val isStale = cacheIsStale || snapshot.activityStale == true
        val completion = when (snapshot.isComplete) {
            true -> "Day complete"
            false -> "Day open"
            null -> null
        }
        val age = ageLabel(ageMs, cacheIsStale, snapshot.activityStale == true)
        return CalibrateTileContent(
            calorieLine = calories,
            stepsLine = snapshot.steps?.coerceAtLeast(0)?.let { "${formatCount(it)} steps" },
            statusLine = listOfNotNull(completion, age).joinToString(" | "),
            isStale = isStale
        )
    }

    private fun calorieLine(consumed: Int?, target: Int?, cachedRemaining: Int?): String {
        val remaining = cachedRemaining ?: if (consumed != null && target != null) target - consumed else null
        if (remaining == null) return "Calories --"
        return if (remaining >= 0) "$remaining kcal left" else "${abs(remaining)} kcal over"
    }

    private fun ageLabel(ageMs: Long, cacheIsStale: Boolean, activityIsStale: Boolean): String {
        val value = when {
            ageMs < MINUTE_MS -> "Updated now"
            ageMs < HOUR_MS -> "${ageMs / MINUTE_MS} min ago"
            ageMs < DAY_MS -> "${ageMs / HOUR_MS} hr ago"
            else -> "${ageMs / DAY_MS} d ago"
        }
        return when {
            cacheIsStale -> "Stale - $value"
            activityIsStale -> "Steps stale - $value"
            else -> value
        }
    }

    private fun formatCount(value: Int): String {
        val digits = value.toString()
        return digits.reversed().chunked(3).joinToString(",").reversed()
    }
}
