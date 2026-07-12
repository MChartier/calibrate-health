package app.calibratehealth.wear

import android.app.Application
import app.calibratehealth.wear.sync.WorkManagerOutboxScheduler
import app.calibratehealth.wear.sync.SnapshotRefreshScheduler

class CalibrateWearApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Recover persisted mutations if the process died between the Room commit and WorkManager enqueue.
        WorkManagerOutboxScheduler(this).schedule()
        // Process launch is an explicit freshness event; no periodic background polling is registered.
        SnapshotRefreshScheduler(this).schedule()
    }
}
