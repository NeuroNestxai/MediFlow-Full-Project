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

data class OrderList(val items: List<Order>, val total: Int)

class OrdersViewModel(private val repo: OrderRepository) : ViewModel() {
    private val _active = MutableStateFlow(Loadable<OrderList>())
    private val _past = MutableStateFlow(Loadable<OrderList>())
    val active: StateFlow<Loadable<OrderList>> = _active.asStateFlow()
    val past: StateFlow<Loadable<OrderList>> = _past.asStateFlow()
    private val _tab = MutableStateFlow(0)
    val tab: StateFlow<Int> = _tab.asStateFlow()
    private var loadingMore = false

    fun selectTab(i: Int) { _tab.value = i }

    fun load(active: Boolean, refresh: Boolean = false) {
        val flow = if (active) _active else _past
        flow.launchLoad(viewModelScope, refresh) { repo.orders(active, 0).let { OrderList(it.items, it.total) } }
    }

    fun refreshAll() {
        load(active = true, refresh = _active.value.data != null)
        load(active = false, refresh = _past.value.data != null)
    }

    fun loadMore(active: Boolean) {
        val flow = if (active) _active else _past
        val current = flow.value.data ?: return
        if (loadingMore || current.items.size >= current.total) return
        loadingMore = true
        viewModelScope.launch {
            try {
                val page = repo.orders(active, current.items.size)
                flow.update { it.copy(data = OrderList(current.items + page.items.filter { n -> current.items.none { it.id == n.id } }, page.total)) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                flow.update { it.copy(error = e) }
            } finally {
                loadingMore = false
            }
        }
    }
}
