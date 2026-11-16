package om.qabnah.consumer.ui.payment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import om.qabnah.consumer.data.OrderRepository
import om.qabnah.core.model.OrderStatus

/**
 * Online payment: `POST /orders/{id}/checkout` → open `checkoutUrl` in a Custom Tab → when the app resumes, poll
 * `GET /orders/{id}` until the server confirms (the client redirect is never trusted).
 */
data class PaymentUi(
    val phase: Phase = Phase.STARTING,
    val checkoutUrl: String? = null,
    /** One-shot request for the screen to open the Custom Tab. */
    val openTab: Boolean = false,
    val error: Throwable? = null,
) {
    enum class Phase { STARTING, IN_BROWSER, CHECKING, PAID, FAILED, PENDING, ERROR }
}

class PaymentViewModel(private val orders: OrderRepository, private val orderId: String) : ViewModel() {
    private val _ui = MutableStateFlow(PaymentUi())
    val ui: StateFlow<PaymentUi> = _ui.asStateFlow()
    private var pollJob: Job? = null

    init { startCheckout() }

    fun startCheckout() {
        viewModelScope.launch {
            _ui.value = PaymentUi(phase = PaymentUi.Phase.STARTING)
            try {
                // The order may already be paid (e.g. user came back via "Pay now" after paying elsewhere).
                val order = orders.order(orderId)
                if (order.status != OrderStatus.PENDING_PAYMENT) {
                    _ui.value = PaymentUi(phase = PaymentUi.Phase.PAID)
                    return@launch
                }
                val checkout = orders.checkout(orderId)
                _ui.value = PaymentUi(phase = PaymentUi.Phase.IN_BROWSER, checkoutUrl = checkout.checkoutUrl, openTab = true)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.value = PaymentUi(phase = PaymentUi.Phase.ERROR, error = e)
            }
        }
    }

    fun onTabOpened() = _ui.update { it.copy(openTab = false) }

    fun reopenTab() = _ui.update { if (it.checkoutUrl != null) it.copy(openTab = true, phase = PaymentUi.Phase.IN_BROWSER) else it }

    /** Called on every ON_RESUME; only polls after the Custom Tab has been shown. */
    fun onResumed() {
        val s = _ui.value
        if (s.openTab) return
        if (s.phase != PaymentUi.Phase.IN_BROWSER && s.phase != PaymentUi.Phase.PENDING) return
        poll()
    }

    fun poll() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            _ui.update { it.copy(phase = PaymentUi.Phase.CHECKING, error = null) }
            repeat(8) { attempt ->
                try {
                    val order = orders.order(orderId)
                    val payment = order.paymentStatus?.lowercase()
                    when {
                        order.status != OrderStatus.PENDING_PAYMENT || payment == "paid" || payment == "captured" -> {
                            _ui.update { it.copy(phase = PaymentUi.Phase.PAID) }
                            return@launch
                        }
                        payment == "failed" || payment == "cancelled" || payment == "expired" -> {
                            _ui.update { it.copy(phase = PaymentUi.Phase.FAILED) }
                            return@launch
                        }
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    if (attempt == 7) {
                        _ui.update { it.copy(phase = PaymentUi.Phase.ERROR, error = e) }
                        return@launch
                    }
                }
                delay(2_000)
            }
            _ui.update { it.copy(phase = PaymentUi.Phase.PENDING) }
        }
    }
}
