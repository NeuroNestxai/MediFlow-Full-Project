package om.qabnah.consumer.ui.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import om.qabnah.android.state.Loadable
import om.qabnah.android.state.launchLoad
import om.qabnah.consumer.data.AccountRepository
import om.qabnah.consumer.data.CartRepository
import om.qabnah.consumer.data.OrderRepository
import om.qabnah.core.cart.Cart
import om.qabnah.core.model.Address
import om.qabnah.core.model.MarketplaceOrderInput
import om.qabnah.core.model.Order
import om.qabnah.core.model.PaymentMethod
import om.qabnah.core.model.PriceBreakdown
import java.util.UUID

data class CheckoutUi(
    val cart: Cart = Cart(),
    val addresses: Loadable<List<Address>> = Loadable(loading = true),
    val selectedAddressId: String? = null,
    val paymentMethod: PaymentMethod? = null,
    val notes: String = "",
    val quote: PriceBreakdown? = null,
    val quoting: Boolean = false,
    val quoteError: Throwable? = null,
    val placing: Boolean = false,
    val placeError: Throwable? = null,
) {
    val availableMethods: List<PaymentMethod>
        get() = buildList {
            if (cart.merchant?.acceptsOnline == true) add(PaymentMethod.ONLINE)
            if (cart.merchant?.acceptsCod == true) add(PaymentMethod.COD)
        }
    val selectedAddress: Address? get() = addresses.data?.firstOrNull { it.id == selectedAddressId }
    val canPlace: Boolean
        get() = !cart.isEmpty && cart.meetsMinimum && selectedAddress?.isInServiceArea == true &&
            paymentMethod != null && quote != null && quoteError == null && !quoting && !placing
}

class CheckoutViewModel(
    private val cartRepo: CartRepository,
    private val orders: OrderRepository,
    private val account: AccountRepository,
) : ViewModel() {
    private val _ui = MutableStateFlow(CheckoutUi())
    val ui: StateFlow<CheckoutUi> = _ui.asStateFlow()

    private val _placed = MutableSharedFlow<Order>(extraBufferCapacity = 1)
    val placed: SharedFlow<Order> = _placed.asSharedFlow()

    private val addresses = MutableStateFlow(Loadable<List<Address>>())
    private var quoteJob: Job? = null

    /** Same key for retries of the same input, a new one when the input changes (server de-duplicates by key). */
    private var idempotencyKey: String = UUID.randomUUID().toString()
    private var keyFingerprint: MarketplaceOrderInput? = null

    init {
        viewModelScope.launch {
            cartRepo.cart.collect { cart ->
                _ui.update { s ->
                    val methods = buildList {
                        if (cart.merchant?.acceptsCod == true) add(PaymentMethod.COD)
                        if (cart.merchant?.acceptsOnline == true) add(PaymentMethod.ONLINE)
                    }
                    s.copy(cart = cart, paymentMethod = s.paymentMethod?.takeIf { it in methods } ?: methods.firstOrNull())
                }
                requote()
            }
        }
        viewModelScope.launch {
            addresses.collect { a ->
                _ui.update { s ->
                    val list = a.data.orEmpty()
                    val keep = s.selectedAddressId?.takeIf { id -> list.any { it.id == id } }
                    val pick = keep ?: list.firstOrNull { it.isDefault && it.isInServiceArea }?.id ?: list.firstOrNull { it.isInServiceArea }?.id
                    s.copy(addresses = a, selectedAddressId = pick)
                }
                requote()
            }
        }
        loadAddresses()
    }

    fun loadAddresses(selectId: String? = null) {
        if (selectId != null) _ui.update { it.copy(selectedAddressId = selectId) }
        addresses.launchLoad(viewModelScope, refresh = addresses.value.data != null) { account.addresses() }
    }

    fun selectAddress(id: String) {
        _ui.update { it.copy(selectedAddressId = id) }
        requote()
    }

    fun selectPayment(method: PaymentMethod) {
        _ui.update { it.copy(paymentMethod = method) }
        requote()
    }

    fun setNotes(notes: String) = _ui.update { it.copy(notes = notes.take(300)) }
    fun setQuantity(index: Int, qty: Int) = cartRepo.setQuantity(index, qty)

    private fun input(s: CheckoutUi): MarketplaceOrderInput? {
        val merchant = s.cart.merchant ?: return null
        val address = s.selectedAddress ?: return null
        val method = s.paymentMethod ?: return null
        if (s.cart.isEmpty) return null
        return MarketplaceOrderInput(
            merchantId = merchant.id,
            items = s.cart.toOrderItems(),
            addressId = address.id,
            paymentMethod = method,
            notes = s.notes.trim().takeIf { it.isNotEmpty() },
            source = "app",
        )
    }

    /** `POST /orders/quote` – debounced; validates options, stock, opening hours and service area server-side. */
    private fun requote() {
        quoteJob?.cancel()
        val req = input(_ui.value)
        if (req == null) {
            _ui.update { it.copy(quote = null, quoting = false, quoteError = null) }
            return
        }
        quoteJob = viewModelScope.launch {
            delay(250)
            _ui.update { it.copy(quoting = true, quoteError = null) }
            try {
                val q = orders.quote(req)
                _ui.update { it.copy(quote = q, quoting = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(quote = null, quoting = false, quoteError = e) }
            }
        }
    }

    fun retryQuote() = requote()

    fun place() {
        val s = _ui.value
        if (!s.canPlace) return
        val req = input(s) ?: return
        if (req != keyFingerprint) {
            keyFingerprint = req
            idempotencyKey = UUID.randomUUID().toString()
        }
        viewModelScope.launch {
            _ui.update { it.copy(placing = true, placeError = null) }
            try {
                val order = orders.place(req, idempotencyKey)
                cartRepo.clear()
                _ui.update { it.copy(placing = false) }
                _placed.emit(order)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(placing = false, placeError = e) }
            }
        }
    }
}
