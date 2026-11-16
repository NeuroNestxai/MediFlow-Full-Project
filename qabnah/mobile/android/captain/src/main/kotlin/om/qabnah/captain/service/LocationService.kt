package om.qabnah.captain.service

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import om.qabnah.android.locale.AppLocale
import om.qabnah.android.location.hasFineLocationPermission
import om.qabnah.captain.CaptainApp
import om.qabnah.core.model.LocationPing

/**
 * Foreground service (type `location`) that runs while the captain is online: streams FusedLocation fixes
 * (every ≥ 5 s) through [om.qabnah.captain.data.LocationReporter] and posts heads-up notifications for new offers
 * while the app is in the background.
 */
class LocationService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var fused: FusedLocationProviderClient
    private var updatesRequested = false
    private val notifiedOffers = mutableSetOf<String>()

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let(::onLocation)
        }
    }

    private val container get() = (application as CaptainApp).container

    override fun onCreate() {
        super.onCreate()
        fused = LocationServices.getFusedLocationProviderClient(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP || !hasFineLocationPermission(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
            ServiceCompat.startForeground(this, Notifications.ID_ONLINE, Notifications.online(this), type)
        } catch (e: Exception) {
            // e.g. ForegroundServiceStartNotAllowedException when restarted from the background on Android 12+.
            Log.w(TAG, "Cannot start location foreground service", e)
            stopSelf()
            return START_NOT_STICKY
        }
        requestUpdates()
        container.realtime.connect()
        observeOffers()
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun requestUpdates() {
        if (updatesRequested) return
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, INTERVAL_MS)
            .setMinUpdateIntervalMillis(INTERVAL_MS)
            .setWaitForAccurateLocation(false)
            .build()
        try {
            fused.requestLocationUpdates(request, callback, Looper.getMainLooper())
            updatesRequested = true
        } catch (e: SecurityException) {
            Log.w(TAG, "Location permission revoked", e)
            stopSelf()
        }
    }

    private var offersObserved = false

    private fun observeOffers() {
        if (offersObserved) return
        offersObserved = true
        scope.launch {
            container.offers.offers.combine(container.appVisible) { offers, visible -> offers to visible }.collect { (offers, visible) ->
                val ids = offers.map { it.id }.toSet()
                (notifiedOffers - ids).forEach { Notifications.cancelOffer(this@LocationService, it) }
                notifiedOffers.retainAll(ids)
                if (!visible) {
                    offers.filter { it.id !in notifiedOffers }.forEach {
                        Notifications.offer(this@LocationService, it, AppLocale.isArabic())
                        notifiedOffers += it.id
                    }
                }
            }
        }
    }

    private fun onLocation(loc: Location) {
        container.locationReporter.report(
            LocationPing(
                lat = loc.latitude,
                lng = loc.longitude,
                heading = if (loc.hasBearing()) loc.bearing.toDouble() else null,
                speed = if (loc.hasSpeed()) loc.speed.toDouble() else null,
                accuracy = if (loc.hasAccuracy()) loc.accuracy.toDouble() else null,
            ),
        )
    }

    override fun onDestroy() {
        if (updatesRequested) fused.removeLocationUpdates(callback)
        notifiedOffers.forEach { Notifications.cancelOffer(this, it) }
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val TAG = "LocationService"
        private const val ACTION_STOP = "om.qabnah.captain.STOP_LOCATION"
        const val INTERVAL_MS = 5_000L

        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, LocationService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, LocationService::class.java))
        }
    }
}
