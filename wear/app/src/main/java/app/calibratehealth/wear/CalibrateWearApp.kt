package app.calibratehealth.wear

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusable
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import app.calibratehealth.wear.actions.WearHomeUiState
import app.calibratehealth.wear.data.local.QuickAddItemEntity

private const val SUMMARY_ROUTE = "summary"
private const val CONNECTION_ROUTE = "connection"
private const val WEIGHT_ROUTE = "weight"

@Composable
fun CalibrateWearApp(
    appState: WearAppState,
    serverConfig: WearServerConfig,
    homeState: WearHomeUiState = WearHomeUiState(),
    onQuickAdd: (QuickAddItemEntity) -> Unit = {},
    onToggleFoodDay: (WearSummary) -> Unit = {},
    onUndo: (WearSummary) -> Unit = {},
    onSaveWeight: (WearSummary, Long) -> Unit = { _, _ -> },
    onContinueOnPhone: (WearSummary) -> Unit = {},
    modifier: Modifier = Modifier
) {
    MaterialTheme {
        AppScaffold(modifier = modifier) {
            val navController = rememberSwipeDismissableNavController()
            SwipeDismissableNavHost(navController = navController, startDestination = SUMMARY_ROUTE) {
                composable(SUMMARY_ROUTE) {
                    SummaryScreen(
                        appState = appState,
                        homeState = homeState,
                        onOpenConnection = { navController.navigate(CONNECTION_ROUTE) },
                        onOpenWeight = { navController.navigate(WEIGHT_ROUTE) },
                        onQuickAdd = onQuickAdd,
                        onToggleFoodDay = onToggleFoodDay,
                        onUndo = onUndo,
                        onContinueOnPhone = onContinueOnPhone
                    )
                }
                composable(CONNECTION_ROUTE) {
                    ConnectionScreen(appState = appState, serverConfig = serverConfig)
                }
                composable(WEIGHT_ROUTE) {
                    val summary = homeState.summary
                    if (summary != null) {
                        WeightScreen(
                            summary = summary,
                            saving = homeState.actionInProgress,
                            onSave = { grams ->
                                onSaveWeight(summary, grams)
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
    onOpenConnection: () -> Unit,
    onOpenWeight: () -> Unit,
    onQuickAdd: (QuickAddItemEntity) -> Unit,
    onToggleFoodDay: (WearSummary) -> Unit,
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
            item {
                Text(
                    text = "Today",
                    style = MaterialTheme.typography.titleMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            when (appState) {
                WearAppState.Unpaired -> item { StatusText("Pair with Calibrate on your phone to see today's summary.") }
                WearAppState.Pairing -> item { StatusText("Pairing securely with your phone...") }
                is WearAppState.PairingError -> item { StatusText(appState.message) }
                is WearAppState.Paired -> item {
                    StatusText("Paired securely. Waiting for the first health sync.")
                }
                is WearAppState.Ready -> {
                    item { CalorieSummaryCard(appState.summary) }
                    item { ActivityCard(appState.summary) }
                    item {
                        WeightCard(
                            summary = appState.summary,
                            enabled = "metric.upsert" !in homeState.pendingMutationTypes,
                            onOpenWeight = onOpenWeight
                        )
                    }
                    item {
                        Button(
                            onClick = { onToggleFoodDay(appState.summary) },
                            enabled = !homeState.actionInProgress &&
                                "food_day.set_complete" !in homeState.pendingMutationTypes,
                            label = { Text(if (appState.summary.foodDayComplete) "Reopen food day" else "Mark food complete") },
                            secondaryLabel = { Text(SummaryFormatter.completion(appState.summary)) },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    if (appState.summary.hasUndoCandidate) {
                        item {
                            Button(
                                onClick = { onUndo(appState.summary) },
                                enabled = !homeState.actionInProgress &&
                                    "food.delete" !in homeState.pendingMutationTypes,
                                label = { Text("Undo ${appState.summary.undoName}") },
                                secondaryLabel = { Text("${appState.summary.undoCalories} kcal") },
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
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
                    item {
                        Button(
                            onClick = { onContinueOnPhone(appState.summary) },
                            enabled = !homeState.actionInProgress,
                            label = { Text("Continue on phone") },
                            secondaryLabel = { Text("Search, scan, or edit details") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    item {
                        val syncLabel = if (homeState.actionInProgress) {
                            "Queueing change..."
                        } else {
                            SummaryFormatter.sync(homeState.syncStatus, appState.summary.lastSyncAtEpochMs)
                        }
                        StatusText(syncLabel)
                    }
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
private fun CalorieSummaryCard(summary: WearSummary) {
    Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(SummaryFormatter.caloriesRemaining(summary), style = MaterialTheme.typography.titleLarge)
            Text(SummaryFormatter.calorieProgress(summary), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun ActivityCard(summary: WearSummary) {
    Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                GlanceMetric(label = "Steps", value = SummaryFormatter.steps(summary))
                GlanceMetric(label = "Activity", value = summary.activityCalories?.let { "$it kcal" } ?: "--")
            }
            Text(SummaryFormatter.activity(summary), style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun WeightCard(summary: WearSummary, enabled: Boolean, onOpenWeight: () -> Unit) {
    Card(onClick = onOpenWeight, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(SummaryFormatter.weight(summary.editableWeightGrams, summary.weightUnit), style = MaterialTheme.typography.titleMedium)
            val detail = if (!enabled) {
                "Weight change pending"
            } else if (summary.todayWeightGrams == null && summary.latestWeightDate != null) {
                "Latest: ${summary.latestWeightDate} | Tap to log today"
            } else {
                "Today's weight | Tap to adjust"
            }
            Text(detail, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun WeightScreen(summary: WearSummary, saving: Boolean, onSave: (Long) -> Unit) {
    val startingWeight = summary.editableWeightGrams
    var editor by remember(summary.localDate, startingWeight) {
        mutableStateOf(startingWeight?.let { WeightEditorState(it, summary.weightUnit) })
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
                    if (change.steps != 0) editor = editor?.adjust(change.steps)
                    true
                }
                .focusRequester(focusRequester)
                .focusable()
        ) {
            item { SectionTitle("Log weight") }
            if (editor == null) {
                item { StatusText("Log your first weight on the phone, then adjust it here.") }
            } else {
                item { Text(editor!!.label(), style = MaterialTheme.typography.titleLarge) }
                item {
                    Button(
                        onClick = { editor = editor?.adjust(-1) },
                        enabled = !saving,
                        label = { Text("Decrease") },
                        secondaryLabel = { Text(if (summary.weightUnit.equals("lb", ignoreCase = true)) "0.1 lb" else "0.1 kg") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    Button(
                        onClick = { editor = editor?.adjust(1) },
                        enabled = !saving,
                        label = { Text("Increase") },
                        secondaryLabel = { Text(if (summary.weightUnit.equals("lb", ignoreCase = true)) "0.1 lb" else "0.1 kg") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    Button(
                        onClick = { editor?.grams?.let(onSave) },
                        enabled = !saving,
                        label = { Text("Save") },
                        secondaryLabel = { Text("Queue today's weigh-in") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    }
}

private fun connectionLabel(appState: WearAppState, syncStatus: WearSyncStatus): String = when (appState) {
    WearAppState.Unpaired -> "Phone setup required"
    WearAppState.Pairing -> "Pairing in progress"
    is WearAppState.PairingError -> "Pairing needs attention"
    is WearAppState.Paired -> if (appState.confirmationPending) "Phone confirmation pending" else "First sync pending"
    is WearAppState.Ready -> SummaryFormatter.sync(syncStatus, appState.summary.lastSyncAtEpochMs)
}

@Composable
private fun GlanceMetric(label: String, value: String) {
    Column(horizontalAlignment = Alignment.Start) {
        Text(value, style = MaterialTheme.typography.titleMedium)
        Text(label, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun StatusText(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun ConnectionScreen(appState: WearAppState, serverConfig: WearServerConfig) {
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
                Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(vertical = 2.dp)) {
                        Text("Server", style = MaterialTheme.typography.labelSmall)
                        Text(serverConfig.defaultServerUrl, style = MaterialTheme.typography.bodySmall)
                        Text("${serverConfig.buildVariant} build", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            item { StatusText(connectionDetail(appState)) }
        }
    }
}

private fun connectionDetail(appState: WearAppState): String = when (appState) {
    WearAppState.Unpaired -> "Open Calibrate settings on your phone and choose the nearby watch to begin."
    WearAppState.Pairing -> "Keep the phone nearby while this one-time secure pairing completes."
    is WearAppState.PairingError -> appState.message
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
    CalibrateWearApp(
        appState = WearAppState.Paired(42, "https://calibratehealth.app"),
        serverConfig = WearServerConfig("https://calibratehealth.app", "preview")
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
