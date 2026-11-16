package com.google.android.gms.location

import android.content.Context
import android.location.Location
import android.os.Looper
import com.google.android.gms.tasks.CancellationToken
import com.google.android.gms.tasks.Task

object LocationServices {
    @JvmStatic fun getFusedLocationProviderClient(context: Context): FusedLocationProviderClient = TODO()
}

interface FusedLocationProviderClient {
    fun getCurrentLocation(priority: Int, token: CancellationToken?): Task<Location>
    val lastLocation: Task<Location>
    fun requestLocationUpdates(request: LocationRequest, callback: LocationCallback, looper: Looper?): Task<Void>
    fun removeLocationUpdates(callback: LocationCallback): Task<Void>
}

object Priority {
    const val PRIORITY_HIGH_ACCURACY = 100
    const val PRIORITY_BALANCED_POWER_ACCURACY = 102
}

class LocationRequest private constructor() {
    class Builder(priority: Int, intervalMillis: Long) {
        fun setMinUpdateIntervalMillis(ms: Long): Builder = this
        fun setWaitForAccurateLocation(wait: Boolean): Builder = this
        fun build(): LocationRequest = TODO()
    }
}

abstract class LocationCallback {
    open fun onLocationResult(result: LocationResult) {}
}

class LocationResult private constructor() {
    val lastLocation: Location? get() = TODO()
}
