package om.qabnah.consumer.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import om.qabnah.android.location.LocationProvider
import om.qabnah.android.state.Loadable
import om.qabnah.consumer.data.StoreRepository
import om.qabnah.core.model.LatLng
import om.qabnah.core.model.MerchantCategory
import om.qabnah.core.model.MerchantSummary

data class HomeUi(
    val location: LatLng? = null,
    val locationResolved: Boolean = false,
    val locationDenied: Boolean = false,
    val category: MerchantCategory? = null,
    val query: String = "",
    val stores: Loadable<List<MerchantSummary>> = Loadable(loading = true),
    val total: Int = 0,
    val loadingMore: Boolean = false,
    /** Open stores with a cover photo from the unfiltered list: the hero carousel (real stores, no invented banners). */
    val featured: List<MerchantSummary> = emptyList(),
    /** A real cover photo per category (first store seen in it), shown on the category chips. */
    val categoryCovers: Map<MerchantCategory, String> = emptyMap(),
) {
    val isFiltered: Boolean get() = category != null || query.isNotBlank()
    val canLoadMore: Boolean get() = (stores.data?.size ?: 0) < total && !loadingMore && !stores.loading
}

class HomeViewModel(
    private val repo: StoreRepository,
    private val locationProvider: LocationProvider,
) : ViewModel() {
    private val _ui = MutableStateFlow(HomeUi())
    val ui: StateFlow<HomeUi> = _ui.asStateFlow()
    private val queryFlow = MutableStateFlow("")
    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            queryFlow.drop(1).debounce(350).distinctUntilChanged().collect { reload() }
        }
    }

    /** Called once the permission dialog (if any) has been answered. */
    fun onLocationPermissionResult(granted: Boolean) {
        if (_ui.value.locationResolved) return
        _ui.update { it.copy(locationResolved = true, locationDenied = !granted) }
        viewModelScope.launch {
            val loc = if (granted) locationProvider.current() else null
            _ui.update { it.copy(location = loc) }
            reload()
        }
    }

    fun onCategory(category: MerchantCategory?) {
        _ui.update { it.copy(category = category) }
        reload()
    }

    fun onQuery(q: String) {
        _ui.update { it.copy(query = q) }
        queryFlow.value = q
    }

    fun refresh() = reload(refresh = true)

    fun reload(refresh: Boolean = false) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _ui.update { it.copy(stores = it.stores.copy(loading = !refresh, refreshing = refresh, error = null)) }
            try {
                val s = _ui.value
                val page = repo.stores(s.location, s.category, s.query, offset = 0)
                _ui.update {
                    it.copy(
                        stores = Loadable(page.items),
                        total = page.total,
                        featured = if (s.isFiltered) it.featured else page.items.filter { m -> m.isOpen && !m.coverUrl.isNullOrBlank() }.take(MAX_FEATURED),
                        categoryCovers = it.categoryCovers.withCoversFrom(page.items),
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(stores = it.stores.copy(loading = false, refreshing = false, error = e)) }
            }
        }
    }

    fun loadMore() {
        val s = _ui.value
        if (!s.canLoadMore) return
        _ui.update { it.copy(loadingMore = true) }
        viewModelScope.launch {
            try {
                val current = s.stores.data.orEmpty()
                val page = repo.stores(s.location, s.category, s.query, offset = current.size)
                _ui.update {
                    it.copy(
                        stores = Loadable(current + page.items.filter { n -> current.none { c -> c.id == n.id } }),
                        total = page.total,
                        loadingMore = false,
                        categoryCovers = it.categoryCovers.withCoversFrom(page.items),
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(loadingMore = false, stores = it.stores.copy(error = e)) }
            }
        }
    }

    private fun Map<MerchantCategory, String>.withCoversFrom(stores: List<MerchantSummary>): Map<MerchantCategory, String> {
        val result = toMutableMap()
        for (m in stores) {
            val cover = m.coverUrl
            if (!cover.isNullOrBlank() && m.category !in result) result[m.category] = cover
        }
        return result
    }

    private companion object {
        const val MAX_FEATURED = 5
    }
}
