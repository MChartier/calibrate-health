package app.calibratehealth.wear.network

import app.calibratehealth.wear.data.local.DailySnapshotEntity
import app.calibratehealth.wear.data.local.QuickAddItemEntity
import app.calibratehealth.wear.data.local.WearCacheLimits
import java.time.Instant
import java.time.LocalDate
import kotlin.math.roundToInt

data class MappedWatchSnapshot(
    val dailySnapshot: DailySnapshotEntity,
    val quickAddItems: List<QuickAddItemEntity>,
    val revision: String
)

/** Maps only the bounded subset persisted by the watch; malformed server data never reaches Room. */
object WatchSnapshotMapper {
    private val REVISION_PATTERN = Regex("^[a-f0-9]{24}$")
    private val MEAL_PERIODS = setOf(
        "BREAKFAST", "MORNING_SNACK", "LUNCH", "AFTERNOON_SNACK", "DINNER", "EVENING_SNACK"
    )
    private const val MAX_LABEL_CHARS = 240
    private const val MAX_DRAFT_CHARS = 8 * 1024
    private const val MAX_CALORIES = 100_000
    private const val MAX_STEPS = 1_000_000
    private const val MAX_WEIGHT_GRAMS = 1_000_000L

    fun map(body: String, fetchedAtEpochMs: Long): MappedWatchSnapshot {
        require(fetchedAtEpochMs > 0) { "Snapshot fetch time must be positive." }
        val root = StrictJson.parse(body).requireObject()
        val localDate = root.requiredString("local_date").also(::requireLocalDate)
        root.requiredString("server_time").also { requireInstant(it, "server_time") }
        root.requiredString("timezone").also { require(it.isNotBlank() && it.length <= 100) }
        val revision = root.requiredString("revision").also {
            require(REVISION_PATTERN.matches(it)) { "Invalid snapshot revision." }
        }
        val weightUnit = root.requiredString("weight_unit").also {
            require(it == "KG" || it == "LB") { "Invalid weight unit." }
        }
        val calories = root.requiredObject("calories")
        val consumed = calories.requiredLong("consumed").boundedInt("calories.consumed", 0, MAX_CALORIES)
        val target = calories.optionalLong("target")?.boundedInt("calories.target", 0, MAX_CALORIES)
        val remaining = calories.optionalLong("remaining")?.boundedInt("calories.remaining", -MAX_CALORIES, MAX_CALORIES)

        val activity = root.optionalObject("activity")
        val steps = activity?.optionalLong("steps")?.boundedInt("activity.steps", 0, MAX_STEPS)
        val activeCalories = activity?.optionalDouble("active_calories_kcal")?.let {
            require(it in 0.0..MAX_CALORIES.toDouble()) { "activity.active_calories_kcal is outside its allowed range." }
            it.roundToInt()
        }
        val totalCalories = activity?.optionalDouble("total_calories_kcal")?.also {
            require(it in 0.0..MAX_CALORIES.toDouble()) { "activity.total_calories_kcal is outside its allowed range." }
        }?.roundToInt()
        val exerciseMinutes = activity?.optionalDouble("exercise_minutes")?.also {
            require(it in 0.0..1_440.0) { "activity.exercise_minutes is outside its allowed range." }
        }?.roundToInt()
        val activityObservedAt = activity?.requiredString("observed_at")?.let {
            requireInstant(it, "activity.observed_at")
        }

        val foodDay = root.requiredObject("food_day")
        val foodDayComplete = foodDay.requiredBoolean("is_complete")
        val foodDayCompletedAt = foodDay.optionalString("completed_at")?.let {
            requireInstant(it, "food_day.completed_at")
        }
        val foodDayRevision = foodDay.optionalString("revision")?.also { require(REVISION_PATTERN.matches(it)) }

        val weight = root.requiredObject("weight")
        val todayWeight = weight.optionalLong("today_grams")?.also(::requireWeight)
        val todayWeightRevision = weight.optionalString("today_revision")?.also { require(REVISION_PATTERN.matches(it)) }
        val latestWeight = weight.optionalLong("latest_grams")?.also(::requireWeight)
        val latestWeightRevision = weight.optionalString("latest_revision")?.also { require(REVISION_PATTERN.matches(it)) }
        val latestWeightDate = weight.optionalString("latest_date")?.also(::requireLocalDate)
        require((todayWeight == null) == (todayWeightRevision == null)) { "Today weight and revision must both be present or absent." }
        require((latestWeight == null) == (latestWeightRevision == null)) { "Latest weight and revision must both be present or absent." }
        require((latestWeight == null) == (latestWeightDate == null)) { "Latest weight and date must both be present or absent." }

        val quickAdds = root.requiredArray("quick_add")
        require(quickAdds.size <= WearCacheLimits.QUICK_ADD_ITEMS) { "Too many quick-add items." }
        val mappedQuickAdds = quickAdds.mapIndexed { index, item ->
            mapQuickAdd(item.requireObject("quick_add[$index]"), index, fetchedAtEpochMs)
        }
        require(mappedQuickAdds.map(QuickAddItemEntity::quickAddId).toSet().size == mappedQuickAdds.size) {
            "Quick-add IDs must be unique."
        }

        val undo = root.optionalObject("undo_candidate")
        val undoFoodLogId = undo?.requiredLong("food_log_id")?.also { require(it > 0) }
        val undoName = undo?.requiredString("name")?.also { requireLabel(it, "undo_candidate.name") }
        val undoCalories = undo?.requiredLong("calories")
            ?.boundedInt("undo_candidate.calories", 0, MAX_CALORIES)
        val undoCreatedAt = undo?.requiredString("created_at")?.let {
            requireInstant(it, "undo_candidate.created_at")
        }
        val staleness = root.requiredObject("staleness")
        val activityStale = staleness.requiredBoolean("activity_stale")
        val activityAgeSeconds = staleness.optionalLong("activity_age_seconds")?.also { require(it >= 0) }

        return MappedWatchSnapshot(
            dailySnapshot = DailySnapshotEntity(
                localDate = localDate,
                caloriesConsumed = consumed,
                calorieTarget = target,
                caloriesRemaining = remaining,
                steps = steps,
                activityCalories = activeCalories,
                activityTotalCalories = totalCalories,
                exerciseMinutes = exerciseMinutes,
                activityObservedAtEpochMs = activityObservedAt,
                activityStale = activityStale,
                activityAgeSeconds = activityAgeSeconds,
                foodDayComplete = foodDayComplete,
                foodDayCompletedAtEpochMs = foodDayCompletedAt,
                foodDayRevision = foodDayRevision,
                todayWeightGrams = todayWeight,
                todayWeightRevision = todayWeightRevision,
                latestWeightGrams = latestWeight,
                latestWeightRevision = latestWeightRevision,
                latestWeightDate = latestWeightDate,
                weightUnit = weightUnit,
                undoFoodLogId = undoFoodLogId,
                undoName = undoName,
                undoCalories = undoCalories,
                undoCreatedAtEpochMs = undoCreatedAt,
                serverRevision = revision,
                fetchedAtEpochMs = fetchedAtEpochMs
            ),
            quickAddItems = mappedQuickAdds,
            revision = revision
        )
    }

    private fun mapQuickAdd(
        value: JsonValue.Object,
        index: Int,
        fetchedAtEpochMs: Long
    ): QuickAddItemEntity {
        val id = value.requiredString("id").also {
            require(it.isNotBlank() && it.length <= 160) { "Invalid quick-add ID." }
        }
        val source = value.requiredString("source").also {
            require(it == "pinned" || it == "recent") { "Invalid quick-add source." }
        }
        val label = value.requiredString("label").also { requireLabel(it, "quick_add.label") }
        val calories = value.requiredLong("calories").boundedInt("quick_add.calories", 0, MAX_CALORIES)
        val draft = value.requiredObject("draft")
        val localDate = draft.requiredString("date").also(::requireLocalDate)
        val mealPeriod = draft.requiredString("meal_period").also {
            require(it in MEAL_PERIODS) { "Invalid quick-add meal period." }
        }
        validateFoodDraft(draft)
        val payloadJson = StrictJson.stringify(draft)
        require(payloadJson.length <= MAX_DRAFT_CHARS) { "Quick-add payload is too large." }
        return QuickAddItemEntity(
            quickAddId = id,
            name = label,
            mealPeriod = mealPeriod,
            calories = calories,
            servingDescription = if (source == "pinned") "1 serving" else "Recent serving",
            mutationPayloadJson = payloadJson,
            sortRank = index,
            updatedAtEpochMs = fetchedAtEpochMs
        ).also { require(it.mutationPayloadJson.contains(localDate)) }
    }

    private fun validateFoodDraft(draft: JsonValue.Object) {
        val myFood = draft.values["my_food_id"]
        if (myFood != null && myFood != JsonValue.Null) {
            val id = (myFood as? JsonValue.NumberValue)?.value?.toLongOrNull()
                ?: throw InvalidJsonException("my_food_id must be an integer.")
            require(id > 0) { "my_food_id must be positive." }
            val servings = (draft.required("servings_consumed") as? JsonValue.NumberValue)
                ?.value?.toDoubleOrNull()?.takeIf(Double::isFinite)
            require(servings != null && servings > 0.0 && servings <= 1_000.0) {
                "servings_consumed is invalid."
            }
            return
        }
        requireLabel(draft.requiredString("name"), "draft.name")
        draft.requiredLong("calories").boundedInt("draft.calories", 0, MAX_CALORIES)
    }

    private fun requireLabel(value: String, field: String) {
        require(value.isNotBlank() && value.length <= MAX_LABEL_CHARS) { "$field is invalid." }
    }

    private fun requireLocalDate(value: String) {
        try {
            require(LocalDate.parse(value).toString() == value) { "Date must use YYYY-MM-DD." }
        } catch (error: Exception) {
            throw InvalidJsonException("Invalid local date.")
        }
    }

    private fun requireInstant(value: String, field: String): Long {
        try {
            return Instant.parse(value).toEpochMilli()
        } catch (error: Exception) {
            throw InvalidJsonException("$field must be an ISO-8601 instant.")
        }
    }

    private fun requireWeight(value: Long) {
        require(value in 1..MAX_WEIGHT_GRAMS) { "Weight is outside its allowed range." }
    }

    private fun Long.boundedInt(field: String, minimum: Int, maximum: Int): Int {
        require(this in minimum.toLong()..maximum.toLong()) { "$field is outside its allowed range." }
        return toInt()
    }
}
