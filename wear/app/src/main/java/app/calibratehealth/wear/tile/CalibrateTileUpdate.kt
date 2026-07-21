package app.calibratehealth.wear.tile

import android.content.ComponentName
import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import app.calibratehealth.wear.complication.CalorieComplicationDataSourceService

/** Invalidates cache-only glance surfaces after a local cache or outbox state transition. */
object CalibrateTileUpdate {
    fun request(context: Context): Boolean = runCatching {
        val appContext = context.applicationContext
        TileService.getUpdater(appContext)
            .requestUpdate(CalibrateTileService::class.java)
        ComplicationDataSourceUpdateRequester.create(
            appContext,
            ComponentName(appContext, CalorieComplicationDataSourceService::class.java)
        ).requestUpdateAll()
    }.isSuccess
}
