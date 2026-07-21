package app.calibratehealth.wear.tile

import kotlin.math.abs

data class CalibrateTileSnapshot(
    val caloriesConsumed: Int?,
    val calorieTarget: Int?,
    val caloriesRemaining: Int?,
    val cachedAtEpochMs: Long
)

data class CalibrateTileContent(
    val calorieLine: String,
    val consumedLine: String,
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
                consumedLine = "Calories unavailable",
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
        val age = ageLabel(ageMs, cacheIsStale)
        return CalibrateTileContent(
            calorieLine = calories,
            consumedLine = consumedLine(snapshot.caloriesConsumed, snapshot.calorieTarget),
            statusLine = age,
            isStale = cacheIsStale
        )
    }

    private fun calorieLine(consumed: Int?, target: Int?, cachedRemaining: Int?): String {
        val remaining = cachedRemaining ?: if (consumed != null && target != null) target - consumed else null
        if (remaining == null) return "Calories --"
        return if (remaining >= 0) {
            "${formatCount(remaining)} kcal left"
        } else {
            "${formatCount(abs(remaining))} kcal over"
        }
    }

    private fun consumedLine(consumed: Int?, target: Int?): String =
        if (consumed != null && target != null) {
            "${formatCount(consumed.coerceAtLeast(0))} of ${formatCount(target.coerceAtLeast(0))} kcal"
        } else {
            "Consumed / target --"
        }

    private fun ageLabel(ageMs: Long, cacheIsStale: Boolean): String {
        val value = when {
            ageMs < MINUTE_MS -> "Updated now"
            ageMs < HOUR_MS -> "${ageMs / MINUTE_MS} min ago"
            ageMs < DAY_MS -> "${ageMs / HOUR_MS} hr ago"
            else -> "${ageMs / DAY_MS} d ago"
        }
        return if (cacheIsStale) "Stale - $value" else value
    }

    private fun formatCount(value: Int): String {
        val digits = value.toString()
        return digits.reversed().chunked(3).joinToString(",").reversed()
    }
}
