package om.qabnah.captain.data

import android.content.Context
import om.qabnah.android.location.LocationProvider
import om.qabnah.android.location.hasFineLocationPermission
import om.qabnah.captain.service.LocationService
import om.qabnah.core.model.CaptainProfile

/**
 * Online/offline state machine. Going online needs an active captain, location permission and a fix
 * (`POST /captain/status {online:true, location}`), then starts the foreground location service and offer polling.
 */
class OnlineController(
    context: Context,
    private val repo: CaptainRepository,
    private val location: LocationProvider,
    private val offers: OfferRepository,
) {
    private val appContext = context.applicationContext

    fun canTrack(): Boolean = hasFineLocationPermission(appContext)

    suspend fun goOnline(): CaptainProfile {
        val here = location.requireCurrent(highAccuracy = true)
        val profile = repo.setOnline(true, here)
        startTracking()
        return profile
    }

    suspend fun goOffline(): CaptainProfile? {
        stopTracking()
        return repo.setOnline(false, null)
    }

    /** After app start: resume tracking if the server still has us online, or go offline if we can't track. */
    suspend fun resume(profile: CaptainProfile) {
        if (!profile.isOnline) return
        if (profile.canGoOnline && canTrack()) startTracking() else runCatching { goOffline() }
    }

    fun startTracking() {
        LocationService.start(appContext)
        offers.start()
    }

    fun stopTracking() {
        LocationService.stop(appContext)
        offers.stop()
    }
}
