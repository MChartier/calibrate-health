package app.calibratehealth.wearpairing

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

/** Receives only the bounded Calibrate coordination namespace and durably queues it for JavaScript. */
class CalibrateWearListenerService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        WearPairingInbox.append(applicationContext, event.sourceNodeId, event.path, event.data)
    }
}
