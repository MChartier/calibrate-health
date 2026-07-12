package app.calibratehealth.wear

import android.app.Application
import app.calibratehealth.wear.sync.WorkManagerOutboxScheduler

class CalibrateWearApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Recover persisted mutations if the process died between the Room commit and WorkManager enqueue.
        // The outbox worker refreshes the snapshot before releasing optimistic action locks.
        WorkManagerOutboxScheduler(this).scheduleForegroundRefresh()
    }
}
