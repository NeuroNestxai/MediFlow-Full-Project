package om.qabnah.consumer.ui.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import om.qabnah.android.state.Loadable
import om.qabnah.android.state.launchLoad
import om.qabnah.consumer.data.OrderRepository
import om.qabnah.core.model.Order
import om.qabnah.core.model.RatingInput
import om.qabnah.core.model.RatingScore
import om.qabnah.core.realtime.Channels
import om.qabnah.core.realtime.RealtimeClient
import om.qabnah.core.realtime.RealtimeEvents

data class OrderActionsUi(
    val busy: Boolean = false,
    val error: Throwable? = null,
    val showCancel: Boolean = false,
    val showRating: Boolean = false,
    val ratingSaved: Boolean = false,
)

class OrderDetailViewModel(
    private val repo: OrderRepository,
    realtime: RealtimeClient,
    private val orderId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(Loadable<Order>())
    val state: StateFlow<Loadable<Order>> = _state.asStateFlow()
    private val _actions = MutableStateFlow(OrderActionsUi())
    val actions: StateFlow<OrderActionsUi> = _actions.asStateFlow()

    init {
        load()
        // Live updates: any status event on order:<id> → refetch the order (payloads are not relied upon).
        viewModelScope.launch {
            realtime.channel(Channels.order(orderId)).collect { ev ->
                if (ev.event == RealtimeEvents.ORDER_STATUS_CHANGED || ev.event == RealtimeEvents.DELIVERY_STATUS_CHANGED ||
                    ev.event == RealtimeEvents.DELIVERY_ASSIGNED
                ) {
                    load(refresh = true)
                }
            }
        }
    }

    fun load(refresh: Boolean = false) {
        _state.launchLoad(viewModelScope, refresh) { repo.order(orderId) }
    }

    fun askCancel(show: Boolean) = _actions.update { it.copy(showCancel = show, error = null) }
    fun askRating(show: Boolean) = _actions.update { it.copy(showRating = show, error = null) }
    fun clearError() = _actions.update { it.copy(error = null) }

    fun cancel(reason: String?) = act {
        val updated = repo.cancel(orderId, reason?.takeIf { it.isNotBlank() })
        _state.update { Loadable(updated) }
        _actions.update { it.copy(showCancel = false) }
    }

    fun rate(captainScore: Int?, captainComment: String, merchantScore: Int?, merchantComment: String) = act {
        repo.rate(
            orderId,
            RatingInput(
                captain = captainScore?.let { RatingScore(it, captainComment.trim().takeIf { c -> c.isNotEmpty() }) },
                merchant = merchantScore?.let { RatingScore(it, merchantComment.trim().takeIf { c -> c.isNotEmpty() }) },
            ),
        )
        _actions.update { it.copy(showRating = false, ratingSaved = true) }
        load(refresh = true)
    }

    private fun act(block: suspend () -> Unit) {
        if (_actions.value.busy) return
        viewModelScope.launch {
            _actions.update { it.copy(busy = true, error = null) }
            try {
                block()
                _actions.update { it.copy(busy = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // 409 (e.g. merchant already accepted) → show message and refresh to the real state.
                _actions.update { it.copy(busy = false, error = e) }
                load(refresh = true)
            }
        }
    }
}
