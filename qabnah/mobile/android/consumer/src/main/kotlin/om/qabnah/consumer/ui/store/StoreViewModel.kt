package om.qabnah.consumer.ui.store

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import om.qabnah.android.state.Loadable
import om.qabnah.android.state.launchLoad
import om.qabnah.consumer.data.CartRepository
import om.qabnah.consumer.data.StoreRepository
import om.qabnah.core.cart.Cart
import om.qabnah.core.cart.CartLine
import om.qabnah.core.cart.CartMerchant
import om.qabnah.core.cart.OptionIssue
import om.qabnah.core.cart.OptionRules
import om.qabnah.core.model.Product
import om.qabnah.core.model.Storefront

/** State of the product bottom sheet. */
data class ProductSheetUi(
    val product: Product,
    val selection: Map<String, Set<String>>,
    val quantity: Int = 1,
    val notes: String = "",
) {
    val issues: List<OptionIssue> get() = OptionRules.validate(product, selection)
    val unitPriceBaisa: Long get() = OptionRules.unitPriceBaisa(product, selection)
    val totalBaisa: Long get() = unitPriceBaisa * quantity
    val canAdd: Boolean get() = product.isPurchasable && issues.isEmpty()
}

class StoreViewModel(
    private val repo: StoreRepository,
    private val cartRepo: CartRepository,
    private val slug: String,
) : ViewModel() {
    private val _state = MutableStateFlow(Loadable<Storefront>())
    val state: StateFlow<Loadable<Storefront>> = _state.asStateFlow()

    private val _sheet = MutableStateFlow<ProductSheetUi?>(null)
    val sheet: StateFlow<ProductSheetUi?> = _sheet.asStateFlow()

    /** Non-null while asking whether to replace a cart from another store. */
    private val _replacePrompt = MutableStateFlow<CartMerchant?>(null)
    val replacePrompt: StateFlow<CartMerchant?> = _replacePrompt.asStateFlow()
    private var pendingLine: CartLine? = null

    val cart: StateFlow<Cart> = cartRepo.cart

    init { load() }

    fun load(refresh: Boolean = false) {
        _state.launchLoad(viewModelScope, refresh) { repo.storefront(slug) }
    }

    fun openProduct(product: Product) {
        _sheet.value = ProductSheetUi(product, OptionRules.defaultSelection(product))
    }

    fun dismissProduct() { _sheet.value = null }

    fun toggleOption(groupId: String, optionId: String) = _sheet.update { s ->
        s ?: return@update null
        val group = s.product.optionGroups.firstOrNull { it.id == groupId } ?: return@update s
        s.copy(selection = s.selection + (groupId to OptionRules.toggle(group, optionId, s.selection[groupId].orEmpty())))
    }

    fun setQuantity(q: Int) = _sheet.update { it?.copy(quantity = q.coerceIn(1, CartLine.MAX_QUANTITY)) }
    fun setNotes(n: String) = _sheet.update { it?.copy(notes = n.take(200)) }

    fun addToCart() {
        val s = _sheet.value ?: return
        val storefront = _state.value.data ?: return
        val line = when (val r = CartLine.build(s.product, s.selection, s.quantity, s.notes)) {
            is CartLine.Result.Ok -> r.line
            is CartLine.Result.Invalid -> return
        }
        val merchant = CartMerchant.from(storefront.merchant)
        when (val result = cartRepo.add(merchant, line)) {
            is Cart.AddResult.Added -> _sheet.value = null
            is Cart.AddResult.DifferentMerchant -> {
                pendingLine = line
                _replacePrompt.value = result.current
            }
        }
    }

    fun confirmReplace() {
        val line = pendingLine ?: return
        val storefront = _state.value.data ?: return
        cartRepo.replace(CartMerchant.from(storefront.merchant), line)
        pendingLine = null
        _replacePrompt.value = null
        _sheet.value = null
    }

    fun cancelReplace() {
        pendingLine = null
        _replacePrompt.value = null
    }
}
