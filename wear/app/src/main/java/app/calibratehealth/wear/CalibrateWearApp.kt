package app.calibratehealth.wear

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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

private const val SUMMARY_ROUTE = "summary"
private const val CONNECTION_ROUTE = "connection"

@Composable
fun CalibrateWearApp(
    appState: WearAppState,
    serverConfig: WearServerConfig,
    modifier: Modifier = Modifier
) {
    MaterialTheme {
        AppScaffold(modifier = modifier) {
            val navController = rememberSwipeDismissableNavController()
            SwipeDismissableNavHost(
                navController = navController,
                startDestination = SUMMARY_ROUTE
            ) {
                composable(SUMMARY_ROUTE) {
                    SummaryScreen(
                        appState = appState,
                        onOpenConnection = { navController.navigate(CONNECTION_ROUTE) }
                    )
                }
                composable(CONNECTION_ROUTE) {
                    ConnectionScreen(appState = appState, serverConfig = serverConfig)
                }
            }
        }
    }
}

@Composable
private fun SummaryScreen(
    appState: WearAppState,
    onOpenConnection: () -> Unit
) {
    val listState = rememberTransformingLazyColumnState()
    ScreenScaffold(scrollState = listState) { contentPadding ->
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
                WearAppState.Unpaired -> item {
                    Text(
                        text = "Pair with Calibrate on your phone to see today's health summary.",
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                WearAppState.Pairing -> item {
                    Text(
                        text = "Pairing securely with your phone...",
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                is WearAppState.PairingError -> item {
                    Text(
                        text = appState.message,
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                is WearAppState.Paired -> item {
                    Text(
                        text = "Paired securely. Your health summary will appear after the first sync.",
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                is WearAppState.Ready -> item {
                    GlanceSummaryCard(summary = appState.summary)
                }
            }
            item {
                Button(
                    onClick = onOpenConnection,
                    label = { Text("Connection") },
                    secondaryLabel = {
                        Text(connectionLabel(appState))
                    },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

private fun connectionLabel(appState: WearAppState): String = when (appState) {
    WearAppState.Unpaired -> "Phone setup required"
    WearAppState.Pairing -> "Pairing in progress"
    is WearAppState.PairingError -> "Pairing needs attention"
    is WearAppState.Paired -> if (appState.confirmationPending) {
        "Paired - phone confirmation pending"
    } else {
        "Paired - sync pending"
    }
    is WearAppState.Ready -> if (appState.summary.isSynced) "Synced" else "Sync pending"
}

@Composable
private fun GlanceSummaryCard(summary: WearSummary) {
    Card(
        onClick = {},
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = SummaryFormatter.caloriesRemaining(summary),
                style = MaterialTheme.typography.titleLarge
            )
            Text(
                text = SummaryFormatter.calorieProgress(summary),
                style = MaterialTheme.typography.bodySmall
            )
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                GlanceMetric(label = "Steps", value = SummaryFormatter.steps(summary))
                GlanceMetric(label = "Weight", value = summary.latestWeight ?: "--")
            }
        }
    }
}

@Composable
private fun GlanceMetric(label: String, value: String) {
    Column(horizontalAlignment = Alignment.Start) {
        Text(text = value, style = MaterialTheme.typography.titleMedium)
        Text(text = label, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun ConnectionScreen(appState: WearAppState, serverConfig: WearServerConfig) {
    val listState = rememberTransformingLazyColumnState()
    ScreenScaffold(scrollState = listState) { contentPadding ->
        TransformingLazyColumn(
            state = listState,
            contentPadding = contentPadding,
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxSize()
        ) {
            item {
                Text(
                    text = "Connection",
                    style = MaterialTheme.typography.titleMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            item {
                Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier.padding(vertical = 2.dp)
                    ) {
                        Text("Server", style = MaterialTheme.typography.labelSmall)
                        Text(serverConfig.defaultServerUrl, style = MaterialTheme.typography.bodySmall)
                        Text("${serverConfig.buildVariant} build", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            item {
                Text(
                    text = connectionDetail(appState),
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
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

@Preview(
    name = "Square unpaired - large text",
    device = "spec:width=192dp,height=192dp,dpi=320",
    showSystemUi = true,
    fontScale = 1.2f
)
@Composable
private fun UnpairedPreview() {
    CalibrateWearApp(
        appState = WearAppState.Unpaired,
        serverConfig = WearServerConfig("https://calibratehealth.app", "preview")
    )
}
