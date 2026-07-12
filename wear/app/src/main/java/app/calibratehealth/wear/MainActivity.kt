package app.calibratehealth.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.mutableStateOf
import app.calibratehealth.wear.pairing.PairingStateEvents
import app.calibratehealth.wear.pairing.PairingStateStore
import app.calibratehealth.wear.pairing.PairingUiState

class MainActivity : ComponentActivity() {
    private val appState = mutableStateOf<WearAppState>(WearAppState.Unpaired)
    private val pairingStateChanged: () -> Unit = {
        runOnUiThread { refreshPairingState() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        refreshPairingState()
        setContent {
            CalibrateWearApp(
                appState = appState.value,
                serverConfig = WearServerConfig.fromBuildConfig()
            )
        }
    }

    override fun onStart() {
        super.onStart()
        PairingStateEvents.addListener(pairingStateChanged)
        refreshPairingState()
    }

    override fun onStop() {
        PairingStateEvents.removeListener(pairingStateChanged)
        super.onStop()
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
