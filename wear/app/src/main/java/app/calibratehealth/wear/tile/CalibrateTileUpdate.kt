package app.calibratehealth.wear.tile

import android.content.Context
import androidx.wear.tiles.TileService

/** Invalidates the system-rendered Tile after a local cache or outbox state transition. */
object CalibrateTileUpdate {
    fun request(context: Context): Boolean = runCatching {
        TileService.getUpdater(context.applicationContext)
            .requestUpdate(CalibrateTileService::class.java)
    }.isSuccess
}
