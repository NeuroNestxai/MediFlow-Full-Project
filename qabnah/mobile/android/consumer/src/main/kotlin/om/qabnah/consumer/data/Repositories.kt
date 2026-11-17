package om.qabnah.consumer.data

import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import om.qabnah.core.api.QabnahApi
import om.qabnah.core.cart.Cart
import om.qabnah.core.cart.CartCodec
import om.qabnah.core.cart.CartLine
import om.qabnah.core.cart.CartMerchant
import om.qabnah.core.model.Address
import om.qabnah.core.model.AddressInput
import om.qabnah.core.model.Checkout
import om.qabnah.core.model.DeliveryQuote
import om.qabnah.core.model.DeliveryQuoteRequest
import om.qabnah.core.model.LatLng
import om.qabnah.core.model.MarketplaceOrderInput
import om.qabnah.core.model.Me
import om.qabnah.core.model.MerchantCategory
import om.qabnah.core.model.Order
import om.qabnah.core.model.OrderType
import om.qabnah.core.model.Page
import om.qabnah.core.model.PriceBreakdown
import om.qabnah.core.model.ProfileUpdate
import om.qabnah.core.model.RatingInput
import om.qabnah.core.model.ShipmentInput
import om.qabnah.core.model.Storefront
import om.qabnah.core.model.StoresPage
import om.qabnah.core.model.Tracking

class StoreRepository(private val api: QabnahApi) {
    suspend fun stores(location: LatLng?, category: MerchantCategory?, query: String?, offset: Int, limit: Int = PAGE): StoresPage =
        api.stores(location, category, query, limit, offset)

    suspend fun storefront(slug: String): Storefront = api.storefront(slug)

    companion object { const val PAGE = 20 }
}

class OrderRepository(private val api: QabnahApi) {
    suspend fun quote(input: MarketplaceOrderInput): PriceBreakdown = api.quoteOrder(input)
    suspend fun place(input: MarketplaceOrderInput, idempotencyKey: String): Order = api.placeOrder(input, idempotencyKey)
    suspend fun quoteParcel(pickup: LatLng, dropoff: LatLng): DeliveryQuote =
        api.deliveryQuote(DeliveryQuoteRequest(OrderType.C2C, pickup, dropoff))
    suspend fun createShipment(input: ShipmentInput, idempotencyKey: String): Order = api.createShipment(input, idempotencyKey)
    suspend fun orders(active: Boolean, offset: Int, limit: Int = 20): Page<Order> =
        api.orders(if (active) "active" else "past", limit, offset)
    suspend fun order(id: String): Order = api.order(id)
    suspend fun cancel(id: String, reason: String?): Order = api.cancelOrder(id, reason)
    suspend fun checkout(id: String): Checkout = api.checkout(id, returnUrl = "qabnah://payment-return?orderId=$id")
    suspend fun tracking(id: String): Tracking = api.tracking(id)
    suspend fun rate(id: String, rating: RatingInput) = api.rateOrder(id, rating)
}

class AccountRepository(private val api: QabnahApi) {
    suspend fun me(): Me = api.me()
    suspend fun updateName(name: String): Me = api.updateMe(ProfileUpdate(fullName = name))
    suspend fun updateLocale(locale: String): Me = api.updateMe(ProfileUpdate(locale = locale))
    suspend fun addresses(): List<Address> = api.addresses().sortedByDescending { it.isDefault }
    suspend fun createAddress(input: AddressInput): Address = api.createAddress(input)
    suspend fun updateAddress(id: String, input: AddressInput): Address = api.updateAddress(id, input)
    suspend fun deleteAddress(id: String) = api.deleteAddress(id)
    suspend fun unreadNotifications(): Int = api.notifications(limit = 1).unread
    suspend fun signOut() = api.logout()
}

/**
 * Single-merchant cart, persisted to SharedPreferences ([CartCodec] JSON) on every change so it survives process death
 * and app restarts (also while browsing as a guest). Carts older than [MAX_AGE_MS] are dropped; checkout re-quotes
 * prices with `POST /orders/quote`, so a stored price is never what gets charged.
 */
class CartRepository(private val prefs: SharedPreferences? = null) {
    private val _cart = MutableStateFlow(CartCodec.decode(prefs?.getString(KEY, null), maxAgeMs = MAX_AGE_MS))
    val cart: StateFlow<Cart> = _cart.asStateFlow()

    fun add(merchant: CartMerchant, line: CartLine): Cart.AddResult {
        val result = _cart.value.add(merchant, line)
        if (result is Cart.AddResult.Added) set(result.cart)
        return result
    }

    fun replace(merchant: CartMerchant, line: CartLine) = mutate { it.replaceWith(merchant, line) }
    fun setQuantity(index: Int, quantity: Int) = mutate { it.setQuantity(index, quantity) }
    fun clear() = set(Cart())

    private fun mutate(transform: (Cart) -> Cart) {
        _cart.update(transform)
        persist(_cart.value)
    }

    private fun set(cart: Cart) {
        _cart.value = cart
        persist(cart)
    }

    private fun persist(cart: Cart) {
        val p = prefs ?: return
        if (cart.isEmpty) p.edit().remove(KEY).apply() else p.edit().putString(KEY, CartCodec.encode(cart)).apply()
    }

    companion object {
        const val PREFS = "qabnah_cart"
        private const val KEY = "cart"
        const val MAX_AGE_MS = 7L * 24 * 60 * 60 * 1000
    }
}
