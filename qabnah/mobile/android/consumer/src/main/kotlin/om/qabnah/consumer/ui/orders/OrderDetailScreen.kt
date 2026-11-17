package om.qabnah.consumer.ui.orders

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.SupportAgent
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.locale.isArabic
import om.qabnah.android.ui.components.LabelValueRow
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.PriceRow
import om.qabnah.android.ui.components.QButton
import om.qabnah.android.ui.components.QCard
import om.qabnah.android.ui.components.QPrice
import om.qabnah.android.ui.components.QSecondaryButton
import om.qabnah.android.ui.components.QTextButton
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.SectionTitle
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.dateTime
import om.qabnah.android.ui.components.deliveryStatusLabel
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.loc
import om.qabnah.android.ui.components.orderStatusColor
import om.qabnah.android.ui.components.orderStatusLabel
import om.qabnah.android.ui.components.paymentMethodLabel
import om.qabnah.android.ui.components.priceText
import om.qabnah.android.ui.components.tabular
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.util.Intents
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.consumer.ui.components.CaptainCard
import om.qabnah.core.model.Order
import om.qabnah.core.model.OrderType
import om.qabnah.core.model.TimelineEntry
import om.qabnah.core.util.localized

@Composable
fun OrderDetailScreen(
    container: ConsumerContainer,
    orderId: String,
    onBack: () -> Unit,
    onTrack: () -> Unit,
    onPay: () -> Unit,
    onHelp: () -> Unit,
) {
    val vm: OrderDetailViewModel = viewModel { OrderDetailViewModel(container.orders, container.realtime, orderId) }
    val state by vm.state.collectAsStateWithLifecycle()
    val actions by vm.actions.collectAsStateWithLifecycle()

    ScreenScaffold(
        title = state.data?.let { digits("#" + it.number) } ?: stringResource(R.string.order_title),
        onBack = onBack,
        actions = {
            IconButton(onClick = onHelp) { Icon(Icons.Outlined.SupportAgent, contentDescription = stringResource(R.string.order_help)) }
        },
    ) { padding ->
        LoadableContent(state = state, onRefresh = { vm.load(refresh = true) }, modifier = Modifier.padding(padding)) { order ->
            OrderBody(
                order = order,
                actionError = actions.error,
                busy = actions.busy,
                ratingSaved = actions.ratingSaved,
                onTrack = onTrack,
                onPay = onPay,
                onCancel = { vm.askCancel(true) },
                onRate = { vm.askRating(true) },
                onHelp = onHelp,
            )
        }
    }

    if (actions.showCancel) CancelDialog(busy = actions.busy, onConfirm = vm::cancel, onDismiss = { vm.askCancel(false) })
    if (actions.showRating) {
        val o = state.data
        RatingDialog(
            hasCaptain = o?.delivery?.captain != null,
            hasMerchant = o?.merchant != null,
            busy = actions.busy,
            onSubmit = vm::rate,
            onDismiss = { vm.askRating(false) },
        )
    }
}

/** Order detail: status header with the one primary action, PIN card, captain card, vertical timeline, items, summary. */
@Composable
private fun OrderBody(
    order: Order,
    actionError: Throwable?,
    busy: Boolean,
    ratingSaved: Boolean,
    onTrack: () -> Unit,
    onPay: () -> Unit,
    onCancel: () -> Unit,
    onRate: () -> Unit,
    onHelp: () -> Unit,
) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Status + primary action
        QCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    val merchant = order.merchant
                    val title = when {
                        order.type == OrderType.C2C -> stringResource(R.string.order_parcel)
                        merchant != null -> loc(merchant.nameEn, merchant.nameAr)
                        else -> stringResource(R.string.order_delivery)
                    }
                    Text(title, style = MaterialTheme.typography.titleLarge)
                    Text(dateTime(order.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                StatusPill(orderStatusLabel(order.status), orderStatusColor(order.status))
            }
            order.delivery?.let { d ->
                Text(deliveryStatusLabel(d.status), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
            }
            order.cancelReason?.let {
                Text(stringResource(R.string.order_cancel_reason, it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
            }
            actionError?.let {
                Text(errorMessage(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
            }
            when {
                order.needsPayment -> QButton(onClick = onPay, modifier = Modifier.fillMaxWidth().padding(top = 14.dp)) {
                    Text(stringResource(R.string.order_pay_now_label), modifier = Modifier.weight(1f))
                    Text(priceText(order.totalBaisa))
                }
                order.isTrackable -> QButton(stringResource(R.string.order_track), onClick = onTrack, icon = Icons.Outlined.Map, modifier = Modifier.fillMaxWidth().padding(top = 14.dp))
                order.canRate && !ratingSaved -> QButton(stringResource(R.string.order_rate), onClick = onRate, enabled = !busy, modifier = Modifier.fillMaxWidth().padding(top = 14.dp))
            }
        }

        // Delivery PIN: the customer gives it to the captain at hand-over.
        val pin = order.delivery?.deliveryPin
        if (pin != null && !order.status.isTerminal) PinCard(pin)

        order.delivery?.captain?.let { captain ->
            QCard(Modifier.fillMaxWidth()) { CaptainCard(captain) }
        }

        if (order.timeline.isNotEmpty()) {
            QCard(Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.order_timeline), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 12.dp))
                Timeline(order.timeline.sortedBy { it.at }, finished = order.status.isTerminal)
            }
        }

        if (order.items.isNotEmpty()) {
            QCard(Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.order_items), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 8.dp))
                order.items.forEachIndexed { index, item ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                        Box(
                            Modifier.size(28.dp).clip(MaterialTheme.shapes.small).background(MaterialTheme.colorScheme.surfaceVariant),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(digits(item.quantity.toString()), style = MaterialTheme.typography.labelMedium.tabular())
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(loc(item.nameEn, item.nameAr), style = MaterialTheme.typography.titleSmall)
                            if (item.options.isNotEmpty()) {
                                val arabic = isArabic()
                                Text(item.options.joinToString(" · ") { localized(it.nameEn, it.nameAr, arabic) }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            item.notes?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                        QPrice(item.lineTotalBaisa, style = MaterialTheme.typography.bodyMedium)
                    }
                    if (index != order.items.lastIndex) HorizontalDivider()
                }
            }
        }
        if (order.type == OrderType.C2C) {
            order.delivery?.let { d ->
                QCard(Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.send_package), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 8.dp))
                    d.packageDescription?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                    Text(stringResource(R.string.order_from, d.pickup.address ?: d.pickup.contactName ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(stringResource(R.string.order_to, d.dropoff.address ?: d.dropoff.contactName ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        QCard(Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.checkout_summary), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 8.dp))
            if (order.subtotalBaisa > 0) PriceRow(stringResource(R.string.price_subtotal), order.subtotalBaisa)
            PriceRow(stringResource(R.string.price_delivery_fee), order.deliveryFeeBaisa)
            if (order.serviceFeeBaisa > 0) PriceRow(stringResource(R.string.price_service_fee), order.serviceFeeBaisa)
            if (order.discountBaisa > 0) PriceRow(stringResource(R.string.price_discount), order.discountBaisa, negative = true)
            if (order.vatBaisa > 0) PriceRow(stringResource(R.string.price_vat), order.vatBaisa)
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            PriceRow(stringResource(R.string.price_total), order.totalBaisa, emphasize = true)
            LabelValueRow(stringResource(R.string.checkout_payment), paymentMethodLabel(order.paymentMethod))
            if (order.codAmountBaisa > 0) PriceRow(stringResource(R.string.order_cod_due), order.codAmountBaisa)
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (order.canRate && !ratingSaved && (order.needsPayment || order.isTrackable)) {
                QSecondaryButton(stringResource(R.string.order_rate), onClick = onRate, enabled = !busy, modifier = Modifier.fillMaxWidth())
            }
            order.invoiceUrl?.takeIf { it.isNotBlank() }?.let { url ->
                // Signed link, valid ~30 min from the last GET /orders/{id} (pull to refresh renews it); no auth header needed.
                val context = LocalContext.current
                val toolbar = MaterialTheme.colorScheme.primary.toArgb()
                QSecondaryButton(
                    stringResource(R.string.order_invoice),
                    onClick = { Intents.openCustomTab(context, url, toolbar) },
                    icon = Icons.Outlined.Description,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            QSecondaryButton(stringResource(R.string.order_help), onClick = onHelp, icon = Icons.Outlined.SupportAgent, modifier = Modifier.fillMaxWidth())
            if (order.canProbablyCancel) {
                QTextButton(stringResource(R.string.order_cancel), onClick = onCancel, enabled = !busy, danger = true, modifier = Modifier.fillMaxWidth())
            }
        }
        Spacer(Modifier.height(12.dp))
    }
}

/** Delivery PIN in four large boxes (always left-to-right, as the captain types it). */
@Composable
private fun PinCard(pin: String) {
    val description = stringResource(R.string.order_pin_title) + " " + pin.toList().joinToString(" ")
    QCard(Modifier.fillMaxWidth(), containerColor = MaterialTheme.colorScheme.primaryContainer) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.order_pin_title), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Row(
                Modifier.fillMaxWidth().padding(vertical = 12.dp).semantics { contentDescription = description },
                horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
            ) {
                pin.forEach { ch ->
                    Box(
                        Modifier
                            .size(width = 56.dp, height = 64.dp)
                            .clip(MaterialTheme.shapes.small)
                            .background(MaterialTheme.colorScheme.surface)
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.small),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(ch.toString(), style = MaterialTheme.typography.headlineLarge.tabular(), modifier = Modifier.clearAndSetSemantics { })
                    }
                }
            }
        }
        Text(stringResource(R.string.order_pin_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
    }
}

/** Vertical timeline: completed steps in the brand colour; the current step is a saffron dot with a soft halo. */
@Composable
private fun Timeline(entries: List<TimelineEntry>, finished: Boolean) {
    entries.forEachIndexed { index, t ->
        val last = index == entries.lastIndex
        val current = last && !finished
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            Column(Modifier.width(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(20.dp), contentAlignment = Alignment.Center) {
                    if (current) Box(Modifier.size(20.dp).clip(CircleShape).background(QabnahColors.Saffron.copy(alpha = 0.25f)))
                    Box(Modifier.size(10.dp).clip(CircleShape).background(if (current) QabnahColors.Saffron else QabnahColors.Primary))
                }
                if (!last) Box(Modifier.width(2.dp).weight(1f).background(QabnahColors.Primary.copy(alpha = 0.35f)))
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f).padding(bottom = if (last) 0.dp else 16.dp)) {
                Text(orderStatusLabel(t.status), style = if (current) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium)
                Text(dateTime(t.at), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                t.note?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

@Composable
private fun CancelDialog(busy: Boolean, onConfirm: (String?) -> Unit, onDismiss: () -> Unit) {
    var reason by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.order_cancel_title)) },
        text = {
            Column {
                Text(stringResource(R.string.order_cancel_body))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it.take(200) },
                    label = { Text(stringResource(R.string.order_cancel_reason_label)) },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
            }
        },
        confirmButton = { QTextButton(stringResource(R.string.order_cancel), onClick = { onConfirm(reason) }, enabled = !busy, danger = true) },
        dismissButton = { QTextButton(stringResource(R.string.order_keep), onClick = onDismiss) },
    )
}

@Composable
private fun RatingDialog(
    hasCaptain: Boolean,
    hasMerchant: Boolean,
    busy: Boolean,
    onSubmit: (Int?, String, Int?, String) -> Unit,
    onDismiss: () -> Unit,
) {
    var captain by remember { mutableStateOf(0) }
    var merchant by remember { mutableStateOf(0) }
    var captainComment by remember { mutableStateOf("") }
    var merchantComment by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.order_rate)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (hasCaptain) {
                    Text(stringResource(R.string.rate_captain))
                    Stars(captain) { captain = it }
                    OutlinedTextField(captainComment, { captainComment = it.take(300) }, label = { Text(stringResource(R.string.rate_comment)) }, modifier = Modifier.fillMaxWidth())
                }
                if (hasMerchant) {
                    Text(stringResource(R.string.rate_store))
                    Stars(merchant) { merchant = it }
                    OutlinedTextField(merchantComment, { merchantComment = it.take(300) }, label = { Text(stringResource(R.string.rate_comment)) }, modifier = Modifier.fillMaxWidth())
                }
            }
        },
        confirmButton = {
            QTextButton(
                stringResource(om.qabnah.android.R.string.common_send),
                enabled = !busy && (captain > 0 || merchant > 0),
                onClick = { onSubmit(captain.takeIf { it > 0 }, captainComment, merchant.takeIf { it > 0 }, merchantComment) },
            )
        },
        dismissButton = { QTextButton(stringResource(om.qabnah.android.R.string.common_cancel), onClick = onDismiss) },
    )
}

@Composable
private fun Stars(value: Int, onChange: (Int) -> Unit) {
    Row {
        (1..5).forEach { i ->
            IconButton(onClick = { onChange(i) }, modifier = Modifier.size(40.dp)) {
                Icon(
                    if (i <= value) Icons.Filled.Star else Icons.Filled.StarBorder,
                    contentDescription = stringResource(R.string.rate_stars, i),
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}
