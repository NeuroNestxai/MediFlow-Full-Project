package om.qabnah.captain.ui.delivery

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
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
import om.qabnah.core.realtime.Channels
import om.qabnah.core.realtime.RealtimeClient

data class DeliveryActionsUi(
    val busy: DeliveryAction? = null,
    val error: Throwable? = null,
    /** fail / release need a reason before posting. */
    val askingReasonFor: DeliveryAction? = null,
)

class DeliveryViewModel(
    private val repo: CaptainRepository,
    realtime: RealtimeClient,
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

    init {
        load()
        viewModelScope.launch { realtime.channel(Channels.delivery(id)).collect { load(refresh = true) } }
        viewModelScope.launch {
            // Fallback when the socket is down (e.g. order cancelled by ops).
            while (isActive) {
                delay(20_000)
                val s = _state.value.data?.status
                if (s == DeliveryStatus.DELIVERED || s == DeliveryStatus.CANCELLED || s == DeliveryStatus.RETURNED) break
                load(refresh = true)
            }
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
