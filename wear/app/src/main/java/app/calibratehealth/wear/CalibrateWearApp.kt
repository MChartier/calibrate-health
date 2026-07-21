package app.calibratehealth.wear

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.focusable
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.EdgeButton
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import app.calibratehealth.wear.actions.WearHomeUiState
import app.calibratehealth.wear.data.local.QuickAddItemEntity
import app.calibratehealth.wear.notifications.WearReminderDeepLink
import app.calibratehealth.wear.notifications.WearReminderNotification
import kotlin.math.abs
import kotlin.math.roundToInt

private const val SUMMARY_ROUTE = "summary"
private const val ACTIONS_ROUTE = "actions"
private const val CONNECTION_ROUTE = "connection"
private const val WEIGHT_ROUTE = "weight"

@Composable
fun CalibrateWearApp(
    appState: WearAppState,
    serverConfig: WearServerConfig,
    homeState: WearHomeUiState = WearHomeUiState(),
    onQuickAdd: (QuickAddItemEntity) -> Unit = {},
    onUndo: (WearSummary) -> Unit = {},
    onSaveWeight: (WearSummary, Long) -> Unit = { _, _ -> },
    onContinueOnPhone: (WearSummary) -> Unit = {},
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
    val currentOnQuickAdd = rememberUpdatedState(onQuickAdd)
    val currentOnUndo = rememberUpdatedState(onUndo)
    val currentOnSaveWeight = rememberUpdatedState(onSaveWeight)
    val currentOnContinueOnPhone = rememberUpdatedState(onContinueOnPhone)
    val currentOnOpenPrivacyOnPhone = rememberUpdatedState(onOpenPrivacyOnPhone)
    val currentOnOpenAccountDeletionOnPhone = rememberUpdatedState(onOpenAccountDeletionOnPhone)
    val currentOnDisconnect = rememberUpdatedState(onDisconnect)
    MaterialTheme {
        AppScaffold(modifier = modifier) {
            val navController = rememberSwipeDismissableNavController()
            val reminderNavigationReady = appState is WearAppState.Ready
            LaunchedEffect(reminderDeepLinkRequest, reminderDeepLink, reminderNavigationReady) {
                if (reminderDeepLink == null || !reminderNavigationReady) return@LaunchedEffect
                if (reminderDeepLink.destination == WearReminderNotification.DESTINATION_WEIGHT) {
                    navController.navigate(WEIGHT_ROUTE) { launchSingleTop = true }
                } else {
                    navController.navigate(ACTIONS_ROUTE) { launchSingleTop = true }
                }
            }
            SwipeDismissableNavHost(navController = navController, startDestination = SUMMARY_ROUTE) {
                composable(SUMMARY_ROUTE) {
                    SummaryScreen(
                        appState = currentAppState.value,
                        homeState = currentHomeState.value,
                        onOpenActions = { navController.navigate(ACTIONS_ROUTE) },
                        onOpenConnection = { navController.navigate(CONNECTION_ROUTE) },
                    )
                }
                composable(ACTIONS_ROUTE) {
                    ActionsScreen(
                        appState = currentAppState.value,
                        homeState = currentHomeState.value,
                        onOpenWeight = { navController.navigate(WEIGHT_ROUTE) },
                        onOpenConnection = { navController.navigate(CONNECTION_ROUTE) },
                        onQuickAdd = currentOnQuickAdd.value,
                        onUndo = currentOnUndo.value,
                        onContinueOnPhone = currentOnContinueOnPhone.value
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
    onOpenActions: () -> Unit,
    onOpenConnection: () -> Unit
) {
    if (appState is WearAppState.Ready) {
        ReadySummaryDashboard(
            summary = appState.summary,
            homeState = homeState,
            onOpenActions = onOpenActions
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
    onOpenActions: () -> Unit
) {
    val progress = calorieProgressFraction(summary.caloriesConsumed, summary.calorieTarget)
    val caloriesRemaining = summary.caloriesRemaining
    val balanceValue = caloriesRemaining?.let { SummaryFormatter.calorieCount(abs(it)) } ?: "--"
    val balanceLabel = when {
        caloriesRemaining == null -> "target unavailable"
        caloriesRemaining < 0 -> "kcal over"
        else -> "kcal left"
    }
    val syncLabel = when {
        homeState.actionInProgress -> "Syncing..."
        homeState.syncStatus is WearSyncStatus.Error -> "Sync needs attention"
        else -> SummaryFormatter.sync(homeState.syncStatus, summary.lastSyncAtEpochMs)
    }
    val progressColor = if ((caloriesRemaining ?: 0) < 0) CALIBRATE_DANGER else CALIBRATE_GREEN
    val listState = rememberTransformingLazyColumnState()

    ScreenScaffold(
        scrollState = listState,
        edgeButton = {
            EdgeButton(
                onClick = onOpenActions,
                colors = ButtonDefaults.buttonColors(
                    containerColor = CALIBRATE_GREEN,
                    contentColor = CALIBRATE_ON_GREEN
                )
            ) {
                Text("Actions")
            }
        }
    ) { contentPadding ->
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .background(CALIBRATE_BACKGROUND)
                .padding(contentPadding),
            contentAlignment = Alignment.Center
        ) {
            // EdgeButton padding changes the usable height across watch sizes. Keep the ring
            // inside the real content bounds instead of assuming a large round display.
            val dashboardDiameter = summaryDashboardDiameter(maxWidth.value, maxHeight.value).dp
            val compactDashboard = dashboardDiameter.value < SUMMARY_COMPACT_DIAMETER_DP
            Box(
                modifier = Modifier
                    .size(dashboardDiameter)
                    .clickable(onClick = onOpenActions)
                    .semantics(mergeDescendants = true) {
                        contentDescription = calorieAccessibilityDescription(summary)
                    },
                contentAlignment = Alignment.Center
            ) {
                Canvas(
                    modifier = Modifier
                        .fillMaxSize()
                        .semantics {
                            progress?.let { progressBarRangeInfo = ProgressBarRangeInfo(it, 0f..1f) }
                        }
                ) {
                    val strokeWidth = 9.dp.toPx()
                    drawArc(
                        color = CALIBRATE_RING_TRACK,
                        startAngle = CALORIE_RING_START_ANGLE,
                        sweepAngle = CALORIE_RING_SWEEP_ANGLE,
                        useCenter = false,
                        style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
                    )
                    progress?.let {
                        drawArc(
                            color = progressColor,
                            startAngle = CALORIE_RING_START_ANGLE,
                            sweepAngle = CALORIE_RING_SWEEP_ANGLE * it,
                            useCenter = false,
                            style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
                        )
                    }
                }
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(1.dp),
                    modifier = Modifier.padding(horizontal = 14.dp)
                ) {
                    CalibrateBrand()
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
                    if (!compactDashboard) {
                        summary.goalTargetWeightGrams?.let {
                            Text(goalProgressHeadline(summary), style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    if (!compactDashboard || homeState.syncStatus is WearSyncStatus.Error) {
                        Text(syncLabel, style = MaterialTheme.typography.labelSmall, color = CALIBRATE_SECONDARY_TEXT)
                    }
                }
            }
        }
    }
}

@Composable
private fun CalibrateBrand() {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Canvas(modifier = Modifier.size(17.dp)) {
            val markStroke = 3.dp.toPx()
            drawArc(
                color = CALIBRATE_GREEN,
                startAngle = -40f,
                sweepAngle = 290f,
                useCenter = false,
                style = Stroke(width = markStroke, cap = StrokeCap.Round)
            )
            drawLine(
                color = CALIBRATE_FOREGROUND,
                start = center,
                end = center.copy(y = size.height * 0.16f),
                strokeWidth = 2.dp.toPx(),
                cap = StrokeCap.Round
            )
        }
        Text("CALIBRATE", style = MaterialTheme.typography.labelSmall, color = CALIBRATE_FOREGROUND)
    }
}

private val CALIBRATE_BACKGROUND = Color(0xFF0E1510)
private val CALIBRATE_FOREGROUND = Color(0xFFF3F7F1)
private val CALIBRATE_SECONDARY_TEXT = Color(0xFFB6C5B6)
private val CALIBRATE_RING_TRACK = Color(0xFF29382B)
private val CALIBRATE_GREEN = Color(0xFF71D478)
private val CALIBRATE_ON_GREEN = Color(0xFF00390A)
private val CALIBRATE_DANGER = Color(0xFFFF796E)
private const val CALORIE_RING_START_ANGLE = 140f
private const val CALORIE_RING_SWEEP_ANGLE = 260f
private const val SUMMARY_DASHBOARD_INSET_DP = 4f
private const val SUMMARY_COMPACT_DIAMETER_DP = 124f

internal fun summaryDashboardDiameter(widthDp: Float, heightDp: Float): Float =
    (minOf(widthDp, heightDp) - SUMMARY_DASHBOARD_INSET_DP).coerceAtLeast(0f)

internal fun calorieProgressFraction(consumed: Int?, target: Int?): Float? = when {
    consumed == null || target == null || target <= 0 -> null
    else -> (consumed.toFloat() / target).coerceIn(0f, 1f)
}

internal fun calorieAccessibilityDescription(summary: WearSummary): String {
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
    return if (current == null) "Goal $target | Log weight on phone" else "Current $current | Goal $target"
}

internal fun goalAccessibilityDescription(summary: WearSummary): String {
    val headline = goalProgressHeadline(summary)
    val detail = goalProgressDetail(summary).replace(" | ", ". ")
    val remaining = summary.goalRemainingWeightGrams?.takeIf { it > 0 }?.let {
        val suffix = if (summary.goalDailyDeficit == 0) "from target" else "remaining"
        " ${SummaryFormatter.weight(it, summary.weightUnit)} $suffix."
    }.orEmpty()
    return "$headline. $detail.$remaining"
}

@Composable
private fun ActionsScreen(
    appState: WearAppState,
    homeState: WearHomeUiState,
    onOpenWeight: () -> Unit,
    onOpenConnection: () -> Unit,
    onQuickAdd: (QuickAddItemEntity) -> Unit,
    onUndo: (WearSummary) -> Unit,
    onContinueOnPhone: (WearSummary) -> Unit
) {
    val listState = rememberTransformingLazyColumnState()
    ScreenScaffold(scrollState = listState, edgeButton = {}) { contentPadding ->
        TransformingLazyColumn(
            state = listState,
            contentPadding = contentPadding,
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxSize()
        ) {
            item { SectionTitle("Actions") }
            if (appState !is WearAppState.Ready) {
                item { StatusText("Finish pairing and sync before using watch actions.") }
                return@TransformingLazyColumn
            }
            val summary = appState.summary
            item {
                Button(
                    onClick = { onContinueOnPhone(summary) },
                    enabled = !homeState.actionInProgress,
                    label = { Text("Continue on phone") },
                    secondaryLabel = { Text("Search, scan, or edit food details") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
            if (homeState.quickAdds.isNotEmpty()) {
                item { SectionTitle("Quick add") }
                homeState.quickAdds.forEach { food ->
                    item(key = food.quickAddId) {
                        Button(
                            onClick = { onQuickAdd(food) },
                            enabled = !homeState.actionInProgress,
                            label = { Text(food.name) },
                            secondaryLabel = { Text("${food.calories} kcal | ${food.servingDescription}") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
            item { SectionTitle("Other") }
            if (summary.editableWeightGrams != null) {
                item {
                    Button(
                        onClick = onOpenWeight,
                        enabled = !homeState.actionInProgress &&
                            "metric.upsert" !in homeState.pendingMutationTypes,
                        label = { Text("Log weight") },
                        secondaryLabel = {
                            Text("Current ${SummaryFormatter.weight(summary.editableWeightGrams, summary.weightUnit)}")
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            if (summary.hasUndoCandidate) {
                item {
                    Button(
                        onClick = { onUndo(summary) },
                        enabled = !homeState.actionInProgress &&
                            "food.delete" !in homeState.pendingMutationTypes,
                        label = { Text("Undo ${summary.undoName}") },
                        secondaryLabel = { Text("${summary.undoCalories} kcal") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
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
private fun WeightScreen(summary: WearSummary, saving: Boolean, onSave: (Long) -> Unit) {
    val startingWeight = summary.editableWeightGrams
    if (startingWeight == null) {
        val listState = rememberTransformingLazyColumnState()
        ScreenScaffold(scrollState = listState, edgeButton = {}) { contentPadding ->
            TransformingLazyColumn(
                state = listState,
                contentPadding = contentPadding,
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxSize()
            ) {
                item { SectionTitle("Log weight") }
                item { StatusText("Log your first weight on the phone before adjusting it on the watch.") }
            }
        }
        return
    }
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
                        secondaryLabel = { Text("Queue today's weigh-in") },
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
