package om.qabnah.captain.ui.deliveries

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import om.qabnah.android.state.Loadable
import om.qabnah.android.state.launchLoad
import om.qabnah.android.ui.components.EmptyState
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.captain.ui.home.DeliveryCard
import om.qabnah.core.model.CaptainDelivery

data class DeliveryList(val items: List<CaptainDelivery>, val total: Int)

class DeliveriesViewModel(private val repo: CaptainRepository) : ViewModel() {
    private val _tab = MutableStateFlow(0)
    val tab: StateFlow<Int> = _tab.asStateFlow()
    private val lists = listOf(MutableStateFlow(Loadable<DeliveryList>()), MutableStateFlow(Loadable<DeliveryList>()))
    val active: StateFlow<Loadable<DeliveryList>> = lists[0].asStateFlow()
    val history: StateFlow<Loadable<DeliveryList>> = lists[1].asStateFlow()
    private var loadingMore = false

    fun selectTab(i: Int) { _tab.value = i }

    fun load(index: Int, refresh: Boolean = false) {
        lists[index].launchLoad(viewModelScope, refresh) { repo.deliveries(active = index == 0).let { DeliveryList(it.items, it.total) } }
    }

    fun refreshAll() {
        load(0, refresh = lists[0].value.data != null)
        load(1, refresh = lists[1].value.data != null)
    }

    fun loadMore(index: Int) {
        val flow = lists[index]
        val current = flow.value.data ?: return
        if (loadingMore || current.items.size >= current.total) return
        loadingMore = true
        viewModelScope.launch {
            try {
                val page = repo.deliveries(active = index == 0, offset = current.items.size)
                flow.update { it.copy(data = DeliveryList(current.items + page.items.filter { n -> current.items.none { it.id == n.id } }, page.total)) }
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

@Composable
fun DeliveriesScreen(container: CaptainContainer, onOpen: (String) -> Unit) {
    val vm: DeliveriesViewModel = viewModel { DeliveriesViewModel(container.captain) }
    val tab by vm.tab.collectAsStateWithLifecycle()
    val active by vm.active.collectAsStateWithLifecycle()
    val history by vm.history.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) {
        vm.refreshAll()
        onPauseOrDispose { }
    }
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Text(stringResource(R.string.deliveries_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(16.dp))
        TabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { vm.selectTab(0) }, text = { Text(stringResource(R.string.deliveries_active)) })
            Tab(selected = tab == 1, onClick = { vm.selectTab(1) }, text = { Text(stringResource(R.string.deliveries_history)) })
        }
        val state = if (tab == 0) active else history
        LoadableContent(
            state = state,
            onRefresh = { vm.load(tab, refresh = true) },
            isEmpty = { it.items.isEmpty() },
            empty = { EmptyState(stringResource(if (tab == 0) R.string.deliveries_empty_active else R.string.deliveries_empty_history), icon = Icons.Filled.LocalShipping) },
        ) { list ->
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
                itemsIndexed(list.items, key = { _, d -> d.id }) { index, d ->
                    if (index >= list.items.size - 3) LaunchedEffect(list.items.size) { vm.loadMore(tab) }
                    DeliveryCard(d, onClick = { onOpen(d.id) })
                }
            }
        }
    }
}
