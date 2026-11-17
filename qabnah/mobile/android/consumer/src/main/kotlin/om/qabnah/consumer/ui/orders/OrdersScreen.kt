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
import om.qabnah.android.ui.components.QCard
import om.qabnah.android.ui.components.QLargeTitle
import om.qabnah.android.ui.components.QPhoto
import om.qabnah.android.ui.components.QPrice
import om.qabnah.android.ui.components.QSegmentedControl
import om.qabnah.android.ui.components.QStoreLogo
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.theme.QabnahColors
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.ui.text.style.TextOverflow
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
        QLargeTitle(stringResource(R.string.orders_title))
        QSegmentedControl(
            options = listOf(stringResource(R.string.orders_active), stringResource(R.string.orders_past)),
            selectedIndex = tab,
            onSelect = vm::selectTab,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
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
        empty = { EmptyState(emptyText) },
    ) { list ->
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            itemsIndexed(list.items, key = { _, o -> o.id }) { index, order ->
                if (index >= list.items.size - 3) LaunchedEffect(list.items.size) { onLoadMore() }
                OrderRow(order, onClick = { onOpen(order.id) })
            }
        }
    }
}

/** Order card: store logo (or the parcel glyph), title, number and date, status pill and total. */
@Composable
private fun OrderRow(order: Order, onClick: () -> Unit) {
    val merchant = order.merchant
    val title = when {
        order.type == OrderType.C2C -> stringResource(R.string.order_parcel)
        merchant != null -> loc(merchant.nameEn, merchant.nameAr)
        else -> stringResource(R.string.order_delivery)
    }
    QCard(Modifier.fillMaxWidth(), onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (merchant != null && order.type != OrderType.C2C) {
                QStoreLogo(merchant.logoUrl, title, QabnahColors.Primary, size = 48.dp)
            } else {
                QPhoto(url = null, contentDescription = null, glyph = Icons.Outlined.Inventory2, shape = MaterialTheme.shapes.small, modifier = Modifier.size(48.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    digits("#" + order.number) + "  ·  " + dateTime(order.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            StatusPill(orderStatusLabel(order.status), orderStatusColor(order.status))
            Spacer(Modifier.weight(1f))
            QPrice(order.totalBaisa, style = MaterialTheme.typography.titleMedium)
        }
    }
}
