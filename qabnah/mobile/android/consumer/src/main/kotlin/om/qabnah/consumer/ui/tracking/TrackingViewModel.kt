package om.qabnah.consumer.ui.tracking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import om.qabnah.consumer.data.OrderRepository
import om.qabnah.core.model.CaptainLocation
import om.qabnah.core.model.LatLng
import om.qabnah.core.model.Tracking
import om.qabnah.core.realtime.Channels
import om.qabnah.core.realtime.ConnectionState
import om.qabnah.core.realtime.RealtimeClient
import om.qabnah.core.realtime.RealtimeEvents
import om.qabnah.core.realtime.deliveryLocation
import om.qabnah.core.util.Eta

data class TrackingUi(
    val tracking: Tracking? = null,
    val loading: Boolean = true,
    val error: Throwable? = null,
    val live: Boolean = false,
    /** Bumped when markers first become available so the map fits them once. */
    val fitKey: Int = 0,
) {
    val captainPosition: LatLng? get() = tracking?.captain?.location?.let { LatLng(it.lat, it.lng) }

    /** Server ETA when present, else a rough distance-based estimate. */
    fun etaMinutes(nowMs: Long = System.currentTimeMillis()): Int? {
        val t = tracking ?: return null
        Eta.minutesUntil(t.etaDropoffAt, nowMs)?.let { return it }
        val from = captainPosition ?: return null
        val to = t.dropoff ?: return null
        return Eta.minutesByDistance(from, to)
    }
}

/**
 * Live tracking: WebSocket `order:<id>` (`delivery.location`, `order.status_changed`, `delivery.status_changed`)
 * plus polling `GET /orders/{id}/tracking` every 10 s as a fallback.
 */
class TrackingViewModel(
    private val repo: OrderRepository,
    private val realtime: RealtimeClient,
    private val orderId: String,
) : ViewModel() {
    private val _ui = MutableStateFlow(TrackingUi())
    val ui: StateFlow<TrackingUi> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            while (isActive) {
                fetch()
                val status = _ui.value.tracking?.orderStatus
                if (status != null && status.isTerminal) break
                delay(POLL_MS)
            }
        }
        viewModelScope.launch {
            realtime.channel(Channels.order(orderId)).collect { ev ->
                when (ev.event) {
                    RealtimeEvents.DELIVERY_LOCATION -> ev.deliveryLocation()?.let { loc ->
                        _ui.update { s ->
                            val t = s.tracking ?: return@update s
                            val captain = t.captain ?: return@update s
                            s.copy(
                                tracking = t.copy(
                                    captain = captain.copy(location = CaptainLocation(loc.lat, loc.lng, loc.heading, null)),
                                    etaDropoffAt = loc.etaDropoffAt ?: t.etaDropoffAt,
                                    path = (t.path + LatLng(loc.lat, loc.lng)).takeLast(200),
                                ),
                            )
                        }
                    }
                    RealtimeEvents.ORDER_STATUS_CHANGED, RealtimeEvents.DELIVERY_STATUS_CHANGED, RealtimeEvents.DELIVERY_ASSIGNED -> fetch()
                }
            }
        }
        viewModelScope.launch {
            realtime.state.collect { st -> _ui.update { it.copy(live = st == ConnectionState.Connected) } }
        }
    }

    fun retry() = viewModelScope.launch { fetch() }

    private suspend fun fetch() {
        try {
            val t = repo.tracking(orderId)
            _ui.update { s ->
                val firstWithMarkers = s.tracking == null || (s.tracking.captain?.location == null && t.captain?.location != null)
                s.copy(tracking = t, loading = false, error = null, fitKey = if (firstWithMarkers) s.fitKey + 1 else s.fitKey)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _ui.update { it.copy(loading = false, error = e) }
        }
    }

    private companion object {
        const val POLL_MS = 10_000L
    }
}
