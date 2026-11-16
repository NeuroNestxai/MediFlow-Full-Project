package om.qabnah.captain.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import om.qabnah.core.api.ApiException
import om.qabnah.core.api.QabnahApi
import om.qabnah.core.model.LatLng
import om.qabnah.core.model.LocationPing
import om.qabnah.core.realtime.RealtimeClient

/**
 * Sends captain location at most every [minIntervalMs]: over the WebSocket (`{"type":"location",…}`) when connected,
 * otherwise via `POST /captain/location`.
 */
class LocationReporter(
    private val api: QabnahApi,
    private val realtime: RealtimeClient,
    private val scope: CoroutineScope,
    private val minIntervalMs: Long = 5_000,
) {
    private var lastSentAt = 0L
    private val _last = MutableStateFlow<LatLng?>(null)
    /** Latest known position (used for status updates and maps). */
    val last: StateFlow<LatLng?> = _last.asStateFlow()

    @Synchronized
    fun report(ping: LocationPing) {
        _last.value = LatLng(ping.lat, ping.lng)
        val now = System.currentTimeMillis()
        if (now - lastSentAt < minIntervalMs) return
        lastSentAt = now
        if (!realtime.sendLocation(ping)) {
            scope.launch {
                try {
                    api.postCaptainLocation(ping)
                } catch (e: ApiException) {
                    // Offline: the next fix will try again.
                }
            }
        }
    }
}
