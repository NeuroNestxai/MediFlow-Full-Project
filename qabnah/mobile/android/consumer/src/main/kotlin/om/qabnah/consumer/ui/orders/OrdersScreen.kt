package om.qabnah.consumer.ui.orders

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.state.Loadable
import om.qabnah.android.ui.components.EmptyState
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.dateTime
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.loc
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.components.orderStatusColor
import om.qabnah.android.ui.components.orderStatusLabel
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.core.model.Order
import om.qabnah.core.model.OrderType

@Composable
fun OrdersScreen(container: ConsumerContainer, onOpen: (String) -> Unit) {
    val vm: OrdersViewModel = viewModel { OrdersViewModel(container.orders) }
    val tab by vm.tab.collectAsStateWithLifecycle()
    val active by vm.active.collectAsStateWithLifecycle()
    val past by vm.past.collectAsStateWithLifecycle()
    // Statuses change while the user is elsewhere: refresh whenever the tab becomes visible again.
    LifecycleResumeEffect(Unit) {
        vm.refreshAll()
        onPauseOrDispose { }
    }
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Text(stringResource(R.string.orders_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(16.dp))
        TabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { vm.selectTab(0) }, text = { Text(stringResource(R.string.orders_active)) })
            Tab(selected = tab == 1, onClick = { vm.selectTab(1) }, text = { Text(stringResource(R.string.orders_past)) })
        }
        val isActive = tab == 0
        OrderList(
            state = if (isActive) active else past,
            onRefresh = { vm.load(isActive, refresh = true) },
            onLoadMore = { vm.loadMore(isActive) },
            onOpen = onOpen,
            emptyText = stringResource(if (isActive) R.string.orders_empty_active else R.string.orders_empty_past),
        )
    }
}

@Composable
private fun OrderList(state: Loadable<OrderList>, onRefresh: () -> Unit, onLoadMore: () -> Unit, onOpen: (String) -> Unit, emptyText: String) {
    LoadableContent(
        state = state,
        onRefresh = onRefresh,
        isEmpty = { it.items.isEmpty() },
        empty = { EmptyState(emptyText, icon = Icons.Filled.Receipt) },
    ) { list ->
        LazyColumn(Modifier.fillMaxSize()) {
            itemsIndexed(list.items, key = { _, o -> o.id }) { index, order ->
                if (index >= list.items.size - 3) LaunchedEffect(list.items.size) { onLoadMore() }
                OrderRow(order, onClick = { onOpen(order.id) })
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun OrderRow(order: Order, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            val title = when {
                order.type == OrderType.C2C -> stringResource(R.string.order_parcel)
                order.merchant != null -> loc(order.merchant!!.nameEn, order.merchant!!.nameAr)
                else -> stringResource(R.string.order_delivery)
            }
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(digits("#" + order.number) + " · " + dateTime(order.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(money(order.totalBaisa), style = MaterialTheme.typography.labelLarge)
        }
        StatusPill(orderStatusLabel(order.status), orderStatusColor(order.status))
    }
}
