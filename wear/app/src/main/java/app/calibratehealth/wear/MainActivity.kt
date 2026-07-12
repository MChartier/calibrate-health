package app.calibratehealth.wear

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
import app.calibratehealth.wear.data.RoomDailySnapshotRepository
import app.calibratehealth.wear.data.RoomMutationOutboxRepository
import app.calibratehealth.wear.data.RoomQuickAddRepository
import app.calibratehealth.wear.data.RoomSyncMetadataRepository
import app.calibratehealth.wear.data.local.CalibrateWearDatabase
import app.calibratehealth.wear.pairing.PairingStateEvents
import app.calibratehealth.wear.pairing.PairingStateStore
import app.calibratehealth.wear.pairing.PairingUiState
import app.calibratehealth.wear.sync.OutboxWorkPolicy
import app.calibratehealth.wear.sync.QueuedMutationFactory
import app.calibratehealth.wear.sync.WorkManagerOutboxScheduler
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel

class MainActivity : ComponentActivity() {
    private val appState = mutableStateOf<WearAppState>(WearAppState.Unpaired)
    private val controllerScope = MainScope()
    private lateinit var homeController: WearHomeController
    private val pairingStateChanged: () -> Unit = {
        runOnUiThread { refreshPairingState() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val database = CalibrateWearDatabase.get(this)
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
                onContinueOnPhone = homeController::continueOnPhone
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
        appState.value = when (val state = PairingStateStore(this).currentUiState()) {
            PairingUiState.Unpaired -> WearAppState.Unpaired
            PairingUiState.Pairing -> WearAppState.Pairing
            is PairingUiState.Error -> WearAppState.PairingError(state.message)
            is PairingUiState.Paired -> WearAppState.Paired(
                state.userId,
                state.serverOrigin,
                state.confirmationPending
            )
        }
    }
}
