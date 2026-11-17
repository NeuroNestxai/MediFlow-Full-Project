package om.qabnah.captain.ui.delivery

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import om.qabnah.android.location.LocationProvider
import om.qabnah.android.state.Loadable
import om.qabnah.android.state.launchLoad
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.captain.data.LocationReporter
import om.qabnah.core.model.CaptainDelivery
import om.qabnah.core.model.DeliveryAction
import om.qabnah.core.model.DeliveryStatus
import om.qabnah.core.model.LatLng
import om.qabnah.core.realtime.Channels
import om.qabnah.core.realtime.RealtimeClient
import om.qabnah.core.util.MapRoute

data class DeliveryActionsUi(
    val busy: DeliveryAction? = null,
    val error: Throwable? = null,
    /** fail / release need a reason before posting. */
    val askingReasonFor: DeliveryAction? = null,
)

/** Map overlays: breadcrumbs (`Tracking.path` + this device's fixes) and the captain's latest position. */
data class DeliveryMapUi(val path: List<LatLng> = emptyList(), val captain: LatLng? = null)

class DeliveryViewModel(
    private val repo: CaptainRepository,
    private val realtime: RealtimeClient,
    private val location: LocationProvider,
    private val reporter: LocationReporter,
    private val id: String,
) : ViewModel() {
    private val _state = MutableStateFlow(Loadable<CaptainDelivery>())
    val state: StateFlow<Loadable<CaptainDelivery>> = _state.asStateFlow()
    private val _actions = MutableStateFlow(DeliveryActionsUi())
    val actions: StateFlow<DeliveryActionsUi> = _actions.asStateFlow()
    private val _released = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    /** The job went back to dispatch; leave the screen. */
    val released: SharedFlow<Unit> = _released.asSharedFlow()
    private val _map = MutableStateFlow(DeliveryMapUi(captain = reporter.last.value))
    val map: StateFlow<DeliveryMapUi> = _map.asStateFlow()

    init {
        load()
    }

    /**
     * Socket subscription, 20 s polling fallback and location updates. The screen runs this under
     * `repeatOnLifecycle(STARTED)`, so nothing polls while the screen is hidden or the app is in the background.
     */
    suspend fun observeWhileVisible() = coroutineScope {
        launch { realtime.channel(Channels.delivery(id)).collect { load(refresh = true) } }
        launch {
            reporter.last.collect { fix ->
                if (fix != null) _map.update { it.copy(captain = fix, path = MapRoute.appendBreadcrumb(it.path, fix)) }
            }
        }
        launch {
            if (_state.value.data != null) load(refresh = true)
            loadPath()
            // Fallback when the socket is down (e.g. order cancelled by ops).
            while (isActive) {
                delay(20_000)
                val s = _state.value.data?.status
                if (s == DeliveryStatus.DELIVERED || s == DeliveryStatus.CANCELLED || s == DeliveryStatus.RETURNED) break
                load(refresh = true)
                loadPath()
            }
        }
    }

    private suspend fun loadPath() {
        // Wait for the first GET /captain/deliveries/{id} (started in init) to learn the order id.
        val orderId = (_state.value.data ?: _state.first { it.data != null }.data)?.orderId?.takeIf { it.isNotBlank() } ?: return
        try {
            val t = repo.tracking(orderId)
            val serverCaptain = t.captain?.location?.let { LatLng(it.lat, it.lng) }
            _map.update { m ->
                val captain = reporter.last.value ?: m.captain ?: serverCaptain
                m.copy(path = if (captain != null) MapRoute.appendBreadcrumb(t.path, captain) else t.path, captain = captain)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Best effort: the map still shows the stops and the live position.
        }
    }

    fun load(refresh: Boolean = false) {
        _state.launchLoad(viewModelScope, refresh) { repo.delivery(id) }
    }

    fun onAction(action: DeliveryAction) {
        if (action.requiresReason) _actions.update { it.copy(askingReasonFor = action, error = null) } else perform(action, null)
    }

    fun dismissReason() = _actions.update { it.copy(askingReasonFor = null) }

    fun perform(action: DeliveryAction, reason: String?) {
        if (_actions.value.busy != null) return
        viewModelScope.launch {
            _actions.value = DeliveryActionsUi(busy = action)
            try {
                val here = reporter.last.value ?: location.current()
                val updated = repo.advance(id, action, reason, here)
                _state.value = Loadable(updated)
                _actions.value = DeliveryActionsUi()
                if (action == DeliveryAction.RELEASE) _released.emit(Unit)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // 409 invalid_transition: someone else changed the job; show why and reload the truth.
                _actions.value = DeliveryActionsUi(error = e)
                load(refresh = true)
            }
        }
    }
}
