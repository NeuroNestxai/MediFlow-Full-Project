package om.qabnah.android.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import om.qabnah.core.model.LatLng

class LocationUnavailableException : Exception("Location unavailable")

/** One-shot location via the Fused Location Provider (Google Play services). */
class LocationProvider(private val context: Context) {
    private val client by lazy { LocationServices.getFusedLocationProviderClient(context) }

    fun hasPermission(): Boolean = hasLocationPermission(context)

    /** Current location (fresh fix, ≤ 10 s) falling back to the last known one; null without permission or fix. */
    @SuppressLint("MissingPermission")
    suspend fun current(highAccuracy: Boolean = false): LatLng? {
        if (!hasPermission()) return null
        return try {
            val cts = CancellationTokenSource()
            val priority = if (highAccuracy) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY
            val fresh = withTimeoutOrNull(10_000) { client.getCurrentLocation(priority, cts.token).await() }
            if (fresh == null) cts.cancel()
            val loc = fresh ?: client.lastLocation.await()
            loc?.let { LatLng(it.latitude, it.longitude) }
        } catch (e: SecurityException) {
            null
        } catch (e: Exception) {
            // Play services missing/outdated or location disabled.
            null
        }
    }

    suspend fun requireCurrent(highAccuracy: Boolean = true): LatLng = current(highAccuracy) ?: throw LocationUnavailableException()
}

fun hasLocationPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

fun hasFineLocationPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
