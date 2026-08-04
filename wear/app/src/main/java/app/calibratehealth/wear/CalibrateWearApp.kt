package app.calibratehealth.wear

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.TimeText
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import app.calibratehealth.wear.actions.WearHomeUiState
import app.calibratehealth.wear.notifications.WearReminderDeepLink
import app.calibratehealth.wear.notifications.WearReminderNotification
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.roundToInt

private const val SUMMARY_ROUTE = "summary"
private const val CONNECTION_ROUTE = "connection"
private const val WEIGHT_ROUTE = "weight"

@Composable
fun CalibrateWearApp(
    appState: WearAppState,
    serverConfig: WearServerConfig,
    homeState: WearHomeUiState = WearHomeUiState(),
    onSaveWeight: (WearSummary, Long) -> Unit = { _, _ -> },
    disconnecting: Boolean = false,
    disconnectError: String? = null,
    publicResourceHandoffStatus: String? = null,
    onOpenPrivacyOnPhone: () -> Unit = {},
    onOpenAccountDeletionOnPhone: () -> Unit = {},
    onDisconnect: () -> Unit = {},
    reminderDeepLink: WearReminderDeepLink? = null,
    reminderDeepLinkRequest: Long = 0,
    modifier: Modifier = Modifier
) {
    // Wear navigation retains destination lambdas; updated state prevents a destination from
    // continuing to render its initial pairing snapshot after the first sync commits.
    val currentAppState = rememberUpdatedState(appState)
    val currentHomeState = rememberUpdatedState(homeState)
    val currentDisconnecting = rememberUpdatedState(disconnecting)
    val currentDisconnectError = rememberUpdatedState(disconnectError)
    val currentPublicResourceHandoffStatus = rememberUpdatedState(publicResourceHandoffStatus)
    val currentOnSaveWeight = rememberUpdatedState(onSaveWeight)
    val currentOnOpenPrivacyOnPhone = rememberUpdatedState(onOpenPrivacyOnPhone)
    val currentOnOpenAccountDeletionOnPhone = rememberUpdatedState(onOpenAccountDeletionOnPhone)
    val currentOnDisconnect = rememberUpdatedState(onDisconnect)
    MaterialTheme {
        val navController = rememberSwipeDismissableNavController()
        val currentBackStackEntry by navController.currentBackStackEntryFlow.collectAsState(
            initial = navController.currentBackStackEntry
        )
        val fullBleedSummary = appState is WearAppState.Ready &&
            currentBackStackEntry?.destination?.route == SUMMARY_ROUTE
        AppScaffold(
            modifier = modifier,
            timeText = { if (!fullBleedSummary) TimeText() }
        ) {
            val reminderNavigationReady = appState is WearAppState.Ready
            LaunchedEffect(reminderDeepLinkRequest, reminderDeepLink, reminderNavigationReady) {
                if (reminderDeepLink == null || !reminderNavigationReady) return@LaunchedEffect
                if (reminderDeepLink.destination == WearReminderNotification.DESTINATION_WEIGHT) {
                    navController.navigate(WEIGHT_ROUTE) { launchSingleTop = true }
                } else {
                    navController.popBackStack(SUMMARY_ROUTE, inclusive = false)
                }
            }
            SwipeDismissableNavHost(navController = navController, startDestination = SUMMARY_ROUTE) {
                composable(SUMMARY_ROUTE) {
                    SummaryScreen(
                        appState = currentAppState.value,
                        homeState = currentHomeState.value,
                        onOpenWeight = { navController.navigate(WEIGHT_ROUTE) },
                        onOpenConnection = { navController.navigate(CONNECTION_ROUTE) },
                    )
                }
                composable(CONNECTION_ROUTE) {
                    ConnectionScreen(
                        appState = currentAppState.value,
                        serverConfig = serverConfig,
                        disconnecting = currentDisconnecting.value,
                        disconnectError = currentDisconnectError.value,
                        publicResourceHandoffStatus = currentPublicResourceHandoffStatus.value,
                        onOpenPrivacyOnPhone = currentOnOpenPrivacyOnPhone.value,
                        onOpenAccountDeletionOnPhone = currentOnOpenAccountDeletionOnPhone.value,
                        onDisconnect = currentOnDisconnect.value
                    )
                }
                composable(WEIGHT_ROUTE) {
                    val latestHomeState = currentHomeState.value
                    val summary = latestHomeState.summary
                    if (summary != null) {
                        WeightScreen(
                            summary = summary,
                            saving = latestHomeState.actionInProgress ||
                                "metric.upsert" in latestHomeState.pendingMutationTypes,
                            onSave = { grams ->
                                currentOnSaveWeight.value(summary, grams)
                                navController.popBackStack()
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryScreen(
    appState: WearAppState,
    homeState: WearHomeUiState,
    onOpenWeight: () -> Unit,
    onOpenConnection: () -> Unit
) {
    if (appState is WearAppState.Ready) {
        ReadySummaryDashboard(
            summary = appState.summary,
            homeState = homeState,
            onOpenWeight = onOpenWeight,
            onOpenConnection = onOpenConnection
        )
        return
    }

    val listState = rememberTransformingLazyColumnState()
    ScreenScaffold(scrollState = listState, edgeButton = {}) { contentPadding ->
        TransformingLazyColumn(
            state = listState,
            contentPadding = contentPadding,
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxSize()
        ) {
            item { CalibrateBrand() }
            when (appState) {
                WearAppState.Unpaired -> item { StatusText("Pair with Calibrate on your phone to see today's summary.") }
                WearAppState.Pairing -> item { StatusText("Pairing securely with your phone...") }
                is WearAppState.PairingError -> item { StatusText(appState.message) }
                is WearAppState.UpgradeRequired -> item { StatusText(appState.message) }
                is WearAppState.Paired -> item {
                    val status = (homeState.syncStatus as? WearSyncStatus.Error)?.message
                        ?: "Paired securely. Waiting for the first health sync."
                    StatusText(status)
                }
                is WearAppState.Ready -> Unit
            }
            item {
                Button(
                    onClick = onOpenConnection,
                    label = { Text("Connection") },
                    secondaryLabel = { Text(connectionLabel(appState, homeState.syncStatus)) },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
private fun ReadySummaryDashboard(
    summary: WearSummary,
    homeState: WearHomeUiState,
    onOpenWeight: () -> Unit,
    onOpenConnection: () -> Unit
) {
    val listState = rememberTransformingLazyColumnState()
    val ringVisibility by animateFloatAsState(
        targetValue = if (listState.canScrollBackward) 0f else 1f,
        animationSpec = tween(durationMillis = SUMMARY_RING_EXIT_DURATION_MS),
        label = "calorie ring visibility"
    )
    val progress = if (summary.isFoodTrackingPaused) {
        null
    } else {
        calorieProgressFraction(summary.caloriesConsumed, summary.calorieTarget)
    }
    val progressColor = if ((summary.caloriesRemaining ?: 0) < 0) CALIBRATE_DANGER else CALIBRATE_GREEN

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(CALIBRATE_BACKGROUND)
    ) {
        val dashboardDiameter = summaryDashboardDiameter(maxWidth.value, maxHeight.value).dp
        val dashboardHeight = maxHeight
        val compactDashboard = dashboardDiameter.value < SUMMARY_COMPACT_DIAMETER_DP
        val ringScale = SUMMARY_RING_MIN_SCALE + ((1f - SUMMARY_RING_MIN_SCALE) * ringVisibility)
        CalorieProgressRing(
            progress = progress,
            progressColor = progressColor,
            modifier = Modifier
                .align(Alignment.Center)
                .size(dashboardDiameter)
                .graphicsLayer {
                    alpha = ringVisibility
                    scaleX = ringScale
                    scaleY = ringScale
                }
        )
        ScreenScaffold(scrollState = listState, edgeButton = {}) { contentPadding ->
            TransformingLazyColumn(
                state = listState,
                contentPadding = contentPadding,
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxSize()
            ) {
                item(key = "calorie-hero") {
                    CalorieHero(
                        summary = summary,
                        compactDashboard = compactDashboard,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(dashboardHeight)
                    )
                }
                item(key = "weight") {
                    val weightSaving = homeState.actionInProgress ||
                        "metric.upsert" in homeState.pendingMutationTypes
                    Button(
                        onClick = onOpenWeight,
                        enabled = !weightSaving,
                        label = { Text(if (weightSaving) "Saving weight..." else "Log weight") },
                        secondaryLabel = {
                            Text(
                                summary.editableWeightGrams?.let {
                                    "Current ${SummaryFormatter.weight(it, summary.weightUnit)}"
                                } ?: "Enter today's weight"
                            )
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item(key = "goal") { GoalProgressSection(summary) }
                summaryStatus(homeState)?.let { status ->
                    item(key = "status") {
                        Text(
                            status.label,
                            style = MaterialTheme.typography.labelSmall,
                            color = status.color,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
                item(key = "connection") {
                    Button(
                        onClick = onOpenConnection,
                        label = { Text("Connection") },
                        secondaryLabel = { Text(connectionLabel(WearAppState.Ready(summary), homeState.syncStatus)) },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    }
}

@Composable
private fun CalorieHero(
    summary: WearSummary,
    compactDashboard: Boolean,
    modifier: Modifier = Modifier
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier.semantics(mergeDescendants = true) {
            contentDescription = calorieAccessibilityDescription(summary)
            if (!summary.isFoodTrackingPaused) {
                calorieProgressFraction(summary.caloriesConsumed, summary.calorieTarget)?.let {
                    progressBarRangeInfo = ProgressBarRangeInfo(it, 0f..1f)
                }
            }
        }
    ) {
        if (summary.isFoodTrackingPaused) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.padding(horizontal = 20.dp)
            ) {
                CalibrateBrand()
                Text(
                    text = "Ⅱ",
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Bold,
                    color = CALIBRATE_GREEN
                )
                Text(
                    text = "Tracking paused",
                    textAlign = TextAlign.Center,
                    fontWeight = FontWeight.Bold,
                    color = CALIBRATE_FOREGROUND,
                    style = MaterialTheme.typography.titleLarge
                )
                Text(
                    text = "Daily calories are paused",
                    textAlign = TextAlign.Center,
                    color = CALIBRATE_SECONDARY_TEXT,
                    style = MaterialTheme.typography.labelSmall
                )
            }
            return@Box
        }

        val caloriesRemaining = summary.caloriesRemaining
        val balanceValue = caloriesRemaining?.let { SummaryFormatter.calorieCount(abs(it)) } ?: "--"
        val balanceLabel = when {
            caloriesRemaining == null -> "target unavailable"
            caloriesRemaining < 0 -> "kcal over"
            else -> "kcal remaining"
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(1.dp),
            modifier = Modifier.padding(horizontal = 18.dp)
        ) {
            CalibrateBrand(showWordmark = !compactDashboard)
            Text(
                balanceValue,
                style = if (compactDashboard) {
                    MaterialTheme.typography.titleLarge
                } else {
                    MaterialTheme.typography.displaySmall
                }
            )
            Text(balanceLabel, style = MaterialTheme.typography.labelMedium)
            Text(SummaryFormatter.calorieProgress(summary), style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun CalorieProgressRing(
    progress: Float?,
    progressColor: Color,
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier) {
        val strokeWidth = 10.dp.toPx()
        val strokeInset = strokeWidth / 2f
        val arcSize = Size(
            width = (size.width - strokeWidth).coerceAtLeast(0f),
            height = (size.height - strokeWidth).coerceAtLeast(0f)
        )
        val arcOrigin = Offset(strokeInset, strokeInset)
        drawArc(
            color = CALIBRATE_RING_TRACK,
            startAngle = CALORIE_RING_START_ANGLE,
            sweepAngle = CALORIE_RING_SWEEP_ANGLE,
            useCenter = false,
            topLeft = arcOrigin,
            size = arcSize,
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
        )
        progress?.let {
            drawArc(
                color = progressColor,
                startAngle = CALORIE_RING_START_ANGLE,
                sweepAngle = CALORIE_RING_SWEEP_ANGLE * it,
                useCenter = false,
                topLeft = arcOrigin,
                size = arcSize,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
            )
        }
    }
}

@Composable
private fun GoalProgressSection(summary: WearSummary) {
    val progress = goalProgressFraction(summary)
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier
            .fillMaxWidth()
            .background(CALIBRATE_SURFACE, RoundedCornerShape(22.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = goalAccessibilityDescription(summary)
                progress?.let { progressBarRangeInfo = ProgressBarRangeInfo(it, 0f..1f) }
            }
    ) {
        Text("Goal", style = MaterialTheme.typography.labelSmall, color = CALIBRATE_SECONDARY_TEXT)
        Text(goalProgressHeadline(summary), style = MaterialTheme.typography.titleMedium)
        GoalProgressBar(progress = progress)
        Text(
            goalProgressDetail(summary),
            style = MaterialTheme.typography.bodySmall,
            color = CALIBRATE_SECONDARY_TEXT
        )
        Text(
            goalProjectionLabel(summary),
            style = MaterialTheme.typography.labelSmall,
            color = CALIBRATE_GOAL
        )
    }
}

@Composable
private fun GoalProgressBar(progress: Float?) {
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(8.dp)
    ) {
        val radius = size.height / 2f
        drawRoundRect(
            color = CALIBRATE_RING_TRACK,
            cornerRadius = CornerRadius(radius, radius)
        )
        val progressWidth = size.width * (progress ?: 0f)
        if (progressWidth > 0f) {
            drawRoundRect(
                color = CALIBRATE_GOAL,
                size = Size(progressWidth, size.height),
                cornerRadius = CornerRadius(radius, radius)
            )
        }
    }
}

private data class SummaryDashboardStatus(val label: String, val color: Color)

private fun summaryStatus(homeState: WearHomeUiState): SummaryDashboardStatus? = when {
    homeState.actionInProgress -> SummaryDashboardStatus("Syncing...", CALIBRATE_SECONDARY_TEXT)
    homeState.syncStatus is WearSyncStatus.Error -> SummaryDashboardStatus("Sync needs attention", CALIBRATE_DANGER)
    else -> null
}

@Composable
private fun CalibrateBrand(showWordmark: Boolean = true) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Canvas(modifier = Modifier.size(19.dp)) {
            val gaugeStroke = 3.5.dp.toPx()
            drawArc(
                color = CALIBRATE_FOREGROUND,
                startAngle = 45f,
                sweepAngle = 270f,
                useCenter = false,
                style = Stroke(width = gaugeStroke, cap = StrokeCap.Butt)
            )
            drawLine(
                color = CALIBRATE_FOREGROUND,
                start = Offset(size.width * 0.5f, size.height * 0.03f),
                end = Offset(size.width * 0.5f, size.height * 0.23f),
                strokeWidth = 2.5.dp.toPx(),
                cap = StrokeCap.Round
            )
            val hub = Offset(size.width * 0.45f, size.height * 0.61f)
            drawLine(
                color = CALIBRATE_NEEDLE,
                start = hub,
                end = Offset(size.width * 0.79f, size.height * 0.27f),
                strokeWidth = 3.dp.toPx(),
                cap = StrokeCap.Round
            )
            drawCircle(color = CALIBRATE_HUB, radius = 3.3.dp.toPx(), center = hub)
            drawCircle(color = CALIBRATE_FOREGROUND, radius = 1.4.dp.toPx(), center = hub)
        }
        if (showWordmark) {
            Text(
                "calibrate",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                ),
                color = CALIBRATE_FOREGROUND,
                maxLines = 1,
                softWrap = false
            )
        }
    }
}

private val CALIBRATE_BACKGROUND = Color(0xFF0E1510)
private val CALIBRATE_FOREGROUND = Color(0xFFF3F7F1)
private val CALIBRATE_SECONDARY_TEXT = Color(0xFFB6C5B6)
private val CALIBRATE_RING_TRACK = Color(0xFF29382B)
private val CALIBRATE_SURFACE = Color(0xFF18241A)
private val CALIBRATE_GREEN = Color(0xFF71D478)
private val CALIBRATE_GOAL = Color(0xFF8DDD2B)
private val CALIBRATE_NEEDLE = Color(0xFF8DDD2B)
private val CALIBRATE_HUB = Color(0xFF2E7D32)
private val CALIBRATE_DANGER = Color(0xFFFF796E)
private const val CALORIE_RING_START_ANGLE = 140f
private const val CALORIE_RING_SWEEP_ANGLE = 260f
private const val SUMMARY_COMPACT_DIAMETER_DP = 160f
// The edge ring fades and contracts as soon as the dashboard leaves its top position.
private const val SUMMARY_RING_EXIT_DURATION_MS = 180
private const val SUMMARY_RING_MIN_SCALE = 0.88f
private val GOAL_DATE_FORMATTER = DateTimeFormatter.ofPattern("MMM d, uuuu", Locale.US)

internal fun summaryDashboardDiameter(widthDp: Float, heightDp: Float): Float =
    minOf(widthDp, heightDp).coerceAtLeast(0f)

internal fun calorieProgressFraction(consumed: Int?, target: Int?): Float? = when {
    consumed == null || target == null || target <= 0 -> null
    else -> (consumed.toFloat() / target).coerceIn(0f, 1f)
}

internal fun goalProgressFraction(summary: WearSummary): Float? = when {
    summary.goalTargetWeightGrams == null -> null
    summary.goalDailyDeficit == 0 -> null
    summary.goalIsComplete == true -> 1f
    summary.goalProgressPercent == null -> null
    else -> (summary.goalProgressPercent.toFloat() / 100f).coerceIn(0f, 1f)
}

internal fun calorieAccessibilityDescription(summary: WearSummary): String {
    if (summary.isFoodTrackingPaused) return "Calorie tracking paused. Review pause on phone."
    val consumed = summary.caloriesConsumed
    val target = summary.calorieTarget
    val remaining = summary.caloriesRemaining
    if (consumed == null || target == null || remaining == null) return "Calorie target unavailable."
    val balance = if (remaining >= 0) {
        "${SummaryFormatter.calorieCount(remaining)} calories remaining."
    } else {
        "${SummaryFormatter.calorieCount(abs(remaining))} calories over target."
    }
    return "${SummaryFormatter.calorieCount(consumed)} calories consumed of " +
        "${SummaryFormatter.calorieCount(target)}. $balance"
}

internal fun goalProgressHeadline(summary: WearSummary): String = when {
    summary.goalDailyDeficit == 0 -> "Maintenance goal"
    summary.goalIsComplete == true -> "Goal reached"
    summary.goalProgressPercent != null -> "${summary.goalProgressPercent.roundToInt()}% to goal"
    else -> "Goal progress"
}

internal fun goalProgressDetail(summary: WearSummary): String {
    val target = summary.goalTargetWeightGrams?.let { SummaryFormatter.weight(it, summary.weightUnit) }
        ?: return "Goal unavailable"
    val current = summary.goalCurrentWeightGrams?.let { SummaryFormatter.weight(it, summary.weightUnit) }
    return if (current == null) "Goal $target | Log weight" else "Current $current | Goal $target"
}

internal fun goalProjectionLabel(summary: WearSummary): String {
    if (summary.goalTargetWeightGrams == null) return "Projection unavailable"
    if (summary.goalDailyDeficit == 0) return "No projected date"
    if (summary.goalIsComplete == true) return "Goal reached"
    val dailyDeficit = summary.goalDailyDeficit ?: return "Projection unavailable"
    val remainingWeightGrams = summary.goalRemainingWeightGrams ?: return "Projection unavailable"
    if (remainingWeightGrams <= 0) return "Goal reached"
    val localDate = runCatching { LocalDate.parse(summary.localDate) }.getOrNull()
        ?: return "Projection unavailable"
    val caloriesRemaining = (remainingWeightGrams / 1_000.0) * CALORIES_PER_KILOGRAM
    val projectedDays = ceil(caloriesRemaining / abs(dailyDeficit.toDouble())).toLong()
    return "Projected ${localDate.plusDays(projectedDays).format(GOAL_DATE_FORMATTER)}"
}

internal fun goalAccessibilityDescription(summary: WearSummary): String {
    val headline = goalProgressHeadline(summary)
    val detail = goalProgressDetail(summary).replace(" | ", ". ")
    val remaining = summary.goalRemainingWeightGrams?.takeIf { it > 0 }?.let {
        val suffix = if (summary.goalDailyDeficit == 0) "from target" else "remaining"
        " ${SummaryFormatter.weight(it, summary.weightUnit)} $suffix."
    }.orEmpty()
    return "$headline. $detail.$remaining ${goalProjectionLabel(summary)}."
}

private const val CALORIES_PER_KILOGRAM = 7_700.0

@Composable
private fun WeightScreen(summary: WearSummary, saving: Boolean, onSave: (Long) -> Unit) {
    val startingWeight = summary.editableWeightGrams ?: WeightEditorState.DEFAULT_WEIGHT_GRAMS
    var editor by remember(summary.localDate, startingWeight, summary.weightUnit) {
        mutableStateOf(WeightEditorState(startingWeight, summary.weightUnit))
    }
    var rotaryPixels by remember { mutableFloatStateOf(0f) }
    val focusRequester = remember { FocusRequester() }
    val listState = rememberTransformingLazyColumnState()
    LaunchedEffect(focusRequester) { focusRequester.requestFocus() }
    ScreenScaffold(scrollState = listState, edgeButton = {}) { contentPadding ->
        TransformingLazyColumn(
            state = listState,
            contentPadding = contentPadding,
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .fillMaxSize()
                .onRotaryScrollEvent { event ->
                    val change = accumulateRotaryWeight(rotaryPixels, event.verticalScrollPixels)
                    rotaryPixels = change.remainingPixels
                    if (change.steps != 0) editor = editor.adjust(change.steps)
                    true
                }
                .focusRequester(focusRequester)
                .focusable()
        ) {
            item { SectionTitle("Log weight") }
            item { Text(editor.label(), style = MaterialTheme.typography.titleLarge) }
                item {
                    Button(
                        onClick = { editor = editor.adjust(-1) },
                        enabled = !saving,
                        label = { Text("Decrease") },
                        secondaryLabel = { Text(if (summary.weightUnit.equals("lb", ignoreCase = true)) "0.1 lb" else "0.1 kg") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    Button(
                        onClick = { editor = editor.adjust(1) },
                        enabled = !saving,
                        label = { Text("Increase") },
                        secondaryLabel = { Text(if (summary.weightUnit.equals("lb", ignoreCase = true)) "0.1 lb" else "0.1 kg") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    Button(
                        onClick = { onSave(editor.grams) },
                        enabled = !saving,
                        label = { Text("Save") },
                        secondaryLabel = { Text("Submit today's weigh-in") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
        }
    }
}

private fun connectionLabel(appState: WearAppState, syncStatus: WearSyncStatus): String = when (appState) {
    WearAppState.Unpaired -> "Phone setup required"
    WearAppState.Pairing -> "Pairing in progress"
    is WearAppState.PairingError -> "Pairing needs attention"
    is WearAppState.UpgradeRequired -> "Update required"
    is WearAppState.Paired -> when {
        appState.confirmationPending -> "Phone confirmation pending"
        syncStatus is WearSyncStatus.Error -> "Sync needs attention"
        else -> "First sync pending"
    }
    is WearAppState.Ready -> SummaryFormatter.sync(syncStatus, appState.summary.lastSyncAtEpochMs)
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun StatusText(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp)
    )
}

@Composable
private fun ConnectionScreen(
    appState: WearAppState,
    serverConfig: WearServerConfig,
    disconnecting: Boolean,
    disconnectError: String?,
    publicResourceHandoffStatus: String?,
    onOpenPrivacyOnPhone: () -> Unit,
    onOpenAccountDeletionOnPhone: () -> Unit,
    onDisconnect: () -> Unit
) {
    var confirmDisconnect by remember(appState) { mutableStateOf(false) }
    val listState = rememberTransformingLazyColumnState()
    ScreenScaffold(scrollState = listState, edgeButton = {}) { contentPadding ->
        TransformingLazyColumn(
            state = listState,
            contentPadding = contentPadding,
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxSize()
        ) {
            item { SectionTitle("Connection") }
            item {
                Column(
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text("Server", style = MaterialTheme.typography.labelSmall)
                    Text(serverConfig.defaultServerUrl, style = MaterialTheme.typography.bodySmall)
                    Text("${serverConfig.buildVariant} build", style = MaterialTheme.typography.labelSmall)
                }
            }
            item { StatusText(connectionDetail(appState)) }
            disconnectError?.let { error -> item { StatusText(error) } }
            if (
                appState is WearAppState.Paired || appState is WearAppState.Ready ||
                appState is WearAppState.UpgradeRequired
            ) {
                item { SectionTitle("Privacy and account") }
                item {
                    Button(
                        onClick = onOpenPrivacyOnPhone,
                        label = { Text("Privacy policy") },
                        secondaryLabel = { Text("Open public policy on phone") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    Button(
                        onClick = onOpenAccountDeletionOnPhone,
                        label = { Text("Account deletion") },
                        secondaryLabel = { Text("Open public request page on phone") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                publicResourceHandoffStatus?.let { status -> item { StatusText(status) } }
            }
            if (
                appState is WearAppState.Paired || appState is WearAppState.Ready ||
                appState is WearAppState.PairingError || appState is WearAppState.UpgradeRequired || disconnectError != null
            ) {
                if (confirmDisconnect) {
                    item { StatusText("This clears Calibrate data and sign-in only from this watch.") }
                    item {
                        Button(
                            onClick = onDisconnect,
                            enabled = !disconnecting,
                            label = { Text(if (disconnecting) "Disconnecting..." else "Confirm disconnect") },
                            secondaryLabel = { Text("Phone and other devices stay signed in") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    item {
                        Button(
                            onClick = { confirmDisconnect = false },
                            enabled = !disconnecting,
                            label = { Text("Cancel") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                } else {
                    item {
                        Button(
                            onClick = { confirmDisconnect = true },
                            label = { Text(if (disconnectError == null) "Disconnect this watch" else "Retry local cleanup") },
                            secondaryLabel = { Text("Clear watch-local data only") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
        }
    }
}

private fun connectionDetail(appState: WearAppState): String = when (appState) {
    WearAppState.Unpaired -> "Open Calibrate settings on your phone and choose the nearby watch to begin."
    WearAppState.Pairing -> "Keep the phone nearby while this one-time secure pairing completes."
    is WearAppState.PairingError -> appState.message
    is WearAppState.UpgradeRequired -> appState.message
    is WearAppState.Paired -> if (appState.confirmationPending) {
        "This watch is paired securely. Keep your phone nearby to confirm the connection."
    } else {
        "This watch is paired securely. No password is stored on the watch."
    }
    is WearAppState.Ready -> "Paired securely. Health data sync is available."
}

@Preview(name = "Round summary", device = "id:wearos_large_round", showSystemUi = true)
@Composable
private fun SummaryPreview() {
    val summary = WearSummary(
        localDate = "2026-07-16",
        caloriesRemaining = 595,
        caloriesConsumed = 1_240,
        calorieTarget = 1_835,
        foodDayComplete = false,
        foodDayRevision = null,
        todayWeightGrams = 76_340,
        todayWeightRevision = null,
        latestWeightGrams = 76_340,
        latestWeightDate = "2026-07-16",
        weightUnit = "LB",
        goalStartWeightGrams = 82_000,
        goalTargetWeightGrams = 72_500,
        goalCurrentWeightGrams = 76_340,
        goalDailyDeficit = 500,
        goalProgressPercent = 59.6,
        goalRemainingWeightGrams = 3_840,
        goalIsComplete = false,
        undoFoodLogId = null,
        undoName = null,
        undoCalories = null,
        fetchedAtEpochMs = 1_000,
        lastSyncAtEpochMs = 1_000
    )
    CalibrateWearApp(
        appState = WearAppState.Ready(summary),
        serverConfig = WearServerConfig("https://calibratehealth.app", "preview"),
        homeState = WearHomeUiState(summary = summary)
    )
}

@Preview(name = "Square unpaired", device = "spec:width=192dp,height=192dp,dpi=320", showSystemUi = true)
@Composable
private fun UnpairedPreview() {
    CalibrateWearApp(
        appState = WearAppState.Unpaired,
        serverConfig = WearServerConfig("https://calibratehealth.app", "preview")
    )
}
