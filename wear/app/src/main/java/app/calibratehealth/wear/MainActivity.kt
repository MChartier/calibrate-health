package app.calibratehealth.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CalibrateWearApp(
                appState = WearAppState.Unpaired,
                serverConfig = WearServerConfig.fromBuildConfig()
            )
        }
    }
}
