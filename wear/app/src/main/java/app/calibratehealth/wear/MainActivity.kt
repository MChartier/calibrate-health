package app.calibratehealth.wear

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.work.WorkInfo
import androidx.work.WorkManager
import app.calibratehealth.wear.actions.DataLayerContinueOnPhoneMessenger
import app.calibratehealth.wear.actions.WearHomeController
import app.calibratehealth.wear.actions.WearLocalDisconnect
import app.calibratehealth.wear.data.RoomDailySnapshotRepository
import app.calibratehealth.wear.data.RoomMutationOutboxRepository
import app.calibratehealth.wear.data.RoomQuickAddRepository
import app.calibratehealth.wear.data.RoomSyncMetadataRepository
import app.calibratehealth.wear.data.local.CalibrateWearDatabase
import app.calibratehealth.wear.pairing.PairingStateEvents
import app.calibratehealth.wear.pairing.PairingStateStore
import app.calibratehealth.wear.pairing.PairingUiState
import app.calibratehealth.wear.notifications.WearReminderDeepLink
import app.calibratehealth.wear.notifications.parseWearReminderDeepLink
import app.calibratehealth.wear.sync.OutboxWorkPolicy
import app.calibratehealth.wear.sync.QueuedMutationFactory
import app.calibratehealth.wear.sync.WorkManagerOutboxScheduler
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val appState = mutableStateOf<WearAppState>(WearAppState.Unpaired)
    private val controllerScope = MainScope()
    private val disconnecting = mutableStateOf(false)
    private val disconnectError = mutableStateOf<String?>(null)
    private val reminderDeepLink = mutableStateOf<WearReminderDeepLink?>(null)
    private val reminderDeepLinkRequest = mutableStateOf(0L)
    private lateinit var homeController: WearHomeController
    private lateinit var localDisconnect: WearLocalDisconnect
    private val pairingStateChanged: () -> Unit = {
        runOnUiThread { refreshPairingState() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val database = CalibrateWearDatabase.get(this)
        localDisconnect = WearLocalDisconnect(this)
        homeController = WearHomeController(
            snapshots = RoomDailySnapshotRepository(database.dailySnapshotDao()),
            quickAdds = RoomQuickAddRepository(database.quickAddItemDao()),
            metadata = RoomSyncMetadataRepository(database.syncMetadataDao()),
            outbox = RoomMutationOutboxRepository(
                database.queuedMutationDao(),
                WorkManagerOutboxScheduler(this)
            ),
            mutationFactory = QueuedMutationFactory(),
            continueOnPhone = DataLayerContinueOnPhoneMessenger(this),
            scope = controllerScope
        )
        observeOutboxWork()
        acceptReminderDeepLink(intent)
        refreshPairingState()
        setContent {
            val homeState by homeController.uiState.collectAsState()
            val displayedAppState = if (
                appState.value is WearAppState.Paired && homeState.summary != null
            ) {
                WearAppState.Ready(homeState.summary)
            } else {
                appState.value
            }
            CalibrateWearApp(
                appState = displayedAppState,
                serverConfig = WearServerConfig.fromBuildConfig(),
                homeState = homeState,
                onQuickAdd = homeController::quickAdd,
                onToggleFoodDay = homeController::toggleFoodDay,
                onUndo = homeController::undo,
                onSaveWeight = homeController::saveWeight,
                onContinueOnPhone = homeController::continueOnPhone,
                disconnecting = disconnecting.value,
                disconnectError = disconnectError.value,
                onDisconnect = ::disconnectThisWatch,
                reminderDeepLink = reminderDeepLink.value,
                reminderDeepLinkRequest = reminderDeepLinkRequest.value
            )
        }
    }

    override fun onStart() {
        super.onStart()
        PairingStateEvents.addListener(pairingStateChanged)
        refreshPairingState()
        // Foreground entry is a freshness event even when the process survived in the background.
        if (appState.value is WearAppState.Paired) {
            WorkManagerOutboxScheduler(this).scheduleForegroundRefresh()
            requestReminderPermissionOnce()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        acceptReminderDeepLink(intent)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REMINDER_PERMISSION_REQUEST &&
            grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        ) {
            WorkManagerOutboxScheduler(this).schedule()
        }
    }

    override fun onStop() {
        PairingStateEvents.removeListener(pairingStateChanged)
        super.onStop()
    }

    override fun onDestroy() {
        controllerScope.cancel()
        super.onDestroy()
    }

    private fun observeOutboxWork() {
        WorkManager.getInstance(this)
            .getWorkInfosForUniqueWorkLiveData(OutboxWorkPolicy.UNIQUE_WORK_NAME)
            .observe(this) { work ->
                if (work.any { it.state == WorkInfo.State.FAILED }) {
                    homeController.reportWorkerFailure()
                } else {
                    homeController.refreshQueueStatus()
                }
            }
    }

    private fun refreshPairingState() {
        val nextState = when (val state = PairingStateStore(this).currentUiState()) {
            PairingUiState.Unpaired -> WearAppState.Unpaired
            PairingUiState.Pairing -> WearAppState.Pairing
            is PairingUiState.Error -> WearAppState.PairingError(state.message)
            is PairingUiState.Paired -> WearAppState.Paired(
                state.userId,
                state.serverOrigin,
                state.confirmationPending
            )
        }
        if (nextState !is WearAppState.Paired) reminderDeepLink.value = null
        appState.value = nextState
    }

    private fun disconnectThisWatch() {
        if (disconnecting.value) return
        disconnecting.value = true
        disconnectError.value = null
        controllerScope.launch {
            val result = localDisconnect.disconnect()
            disconnecting.value = false
            disconnectError.value = result.exceptionOrNull()?.let {
                "Local data could not be fully cleared. Pairing access was removed; try again before re-pairing."
            }
            refreshPairingState()
        }
    }

    private fun acceptReminderDeepLink(intent: Intent?) {
        val parsed = parseWearReminderDeepLink(intent) ?: return
        reminderDeepLink.value = parsed
        reminderDeepLinkRequest.value += 1
    }

    private fun requestReminderPermissionOnce() {
        if (Build.VERSION.SDK_INT < 33 ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) return
        val preferences = getSharedPreferences("calibrate_wear_reminders", MODE_PRIVATE)
        if (preferences.getBoolean("permission_requested", false)) return
        if (!preferences.edit().putBoolean("permission_requested", true).commit()) return
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REMINDER_PERMISSION_REQUEST)
    }

    private companion object {
        const val REMINDER_PERMISSION_REQUEST = 4102
    }
}
