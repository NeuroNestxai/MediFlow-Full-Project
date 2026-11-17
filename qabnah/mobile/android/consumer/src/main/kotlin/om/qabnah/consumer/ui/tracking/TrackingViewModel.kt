package om.qabnah.consumer.ui.tracking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
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
import om.qabnah.core.util.MapRoute

data class TrackingUi(
    val tracking: Tracking? = null,
    val loading: Boolean = true,
    val error: Throwable? = null,
    val live: Boolean = false,
    /** Bumped when the map should re-fit: first data, captain first located, next stop changed. */
    val fitKey: Int = 0,
) {
    val captainPosition: LatLng? get() = tracking?.captain?.location?.let { LatLng(it.lat, it.lng) }

    /** Pickup until the parcel is picked up, then the dropoff. */
    val nextStop: LatLng? get() = tracking?.let { MapRoute.nextStop(it.deliveryStatus, it.pickup, it.dropoff) }

    /** Dashed captain → next stop leg. */
    val remainingLeg: List<LatLng> get() = MapRoute.remainingLeg(captainPosition, nextStop)

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
 * plus polling `GET /orders/{id}/tracking` every 10 s as a fallback. Both run only inside [observeWhileVisible], which the
 * screen calls under `repeatOnLifecycle(STARTED)`, so nothing polls while the screen is hidden or the app is in the
 * background.
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
            realtime.state.collect { st -> _ui.update { it.copy(live = st == ConnectionState.Connected) } }
        }
    }

    /** Suspends until cancelled (screen no longer STARTED). */
    suspend fun observeWhileVisible() = coroutineScope {
        launch {
            while (isActive) {
                fetch()
                val status = _ui.value.tracking?.orderStatus
                if (status != null && status.isTerminal) break
                delay(POLL_MS)
            }
        }
        launch {
            realtime.channel(Channels.order(orderId)).collect { ev ->
                when (ev.event) {
                    RealtimeEvents.DELIVERY_LOCATION -> ev.deliveryLocation()?.let { loc ->
                        _ui.update { s ->
                            val t = s.tracking ?: return@update s
                            val captain = t.captain ?: return@update s
                            val firstFix = captain.location == null
                            s.copy(
                                tracking = t.copy(
                                    captain = captain.copy(location = CaptainLocation(loc.lat, loc.lng, loc.heading, null)),
                                    etaDropoffAt = loc.etaDropoffAt ?: t.etaDropoffAt,
                                    path = MapRoute.appendBreadcrumb(t.path, LatLng(loc.lat, loc.lng)),
                                ),
                                fitKey = if (firstFix) s.fitKey + 1 else s.fitKey,
                            )
                        }
                    }
                    RealtimeEvents.ORDER_STATUS_CHANGED, RealtimeEvents.DELIVERY_STATUS_CHANGED, RealtimeEvents.DELIVERY_ASSIGNED -> fetch()
                }
            }
        }
    }

    fun retry() = viewModelScope.launch { fetch() }

    private suspend fun fetch() {
        try {
            val t = repo.tracking(orderId)
            _ui.update { s ->
                val old = s.tracking
                val refit = old == null ||
                    (old.captain?.location == null && t.captain?.location != null) ||
                    old.deliveryStatus != t.deliveryStatus
                s.copy(tracking = t, loading = false, error = null, fitKey = if (refit) s.fitKey + 1 else s.fitKey)
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
