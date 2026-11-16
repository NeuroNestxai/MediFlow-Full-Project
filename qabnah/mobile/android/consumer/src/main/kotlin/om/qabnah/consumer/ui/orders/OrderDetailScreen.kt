package om.qabnah.consumer.ui.orders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.locale.isArabic
import om.qabnah.android.ui.components.LabelValueRow
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.SectionTitle
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.dateTime
import om.qabnah.android.ui.components.deliveryStatusLabel
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.loc
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.components.orderStatusColor
import om.qabnah.android.ui.components.orderStatusLabel
import om.qabnah.android.ui.components.paymentMethodLabel
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.core.model.Order
import om.qabnah.core.model.OrderType
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
            IconButton(onClick = onHelp) { Icon(Icons.Filled.SupportAgent, contentDescription = stringResource(R.string.order_help)) }
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
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                val title = when {
                    order.type == OrderType.C2C -> stringResource(R.string.order_parcel)
                    order.merchant != null -> loc(order.merchant!!.nameEn, order.merchant!!.nameAr)
                    else -> stringResource(R.string.order_delivery)
                }
                Text(title, style = MaterialTheme.typography.titleLarge)
                Text(dateTime(order.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            StatusPill(orderStatusLabel(order.status), orderStatusColor(order.status))
        }
        order.delivery?.let { d ->
            Text(
                deliveryStatusLabel(d.status),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        }
        actionError?.let {
            Text(errorMessage(it), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
        }

        if (order.needsPayment) {
            Button(onClick = onPay, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(stringResource(R.string.order_pay_now, money(order.totalBaisa)))
            }
        }
        if (order.isTrackable) {
            Button(onClick = onTrack, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                Icon(Icons.Filled.Map, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.order_track))
            }
        }

        // Delivery PIN: the customer gives it to the captain at hand-over.
        val pin = order.delivery?.deliveryPin
        if (pin != null && !order.status.isTerminal) {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                modifier = Modifier.fillMaxWidth().padding(16.dp),
            ) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Lock, contentDescription = null)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.order_pin_title), style = MaterialTheme.typography.titleSmall)
                        Text(stringResource(R.string.order_pin_hint), style = MaterialTheme.typography.bodySmall)
                    }
                    Text(
                        pin,
                        style = MaterialTheme.typography.headlineMedium.copy(textDirection = TextDirection.Ltr, letterSpacing = 6.sp),
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }

        if (order.items.isNotEmpty()) {
            SectionTitle(stringResource(R.string.order_items))
            order.items.forEach { item ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
                    Text(digits("${item.quantity}×"), modifier = Modifier.width(36.dp), style = MaterialTheme.typography.bodyLarge)
                    Column(Modifier.weight(1f)) {
                        Text(loc(item.nameEn, item.nameAr), style = MaterialTheme.typography.bodyLarge)
                        if (item.options.isNotEmpty()) {
                            val arabic = isArabic()
                            Text(item.options.joinToString(" · ") { localized(it.nameEn, it.nameAr, arabic) }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        item.notes?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    Text(money(item.lineTotalBaisa), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        if (order.type == OrderType.C2C) {
            order.delivery?.let { d ->
                SectionTitle(stringResource(R.string.send_package))
                Column(Modifier.padding(horizontal = 16.dp)) {
                    d.packageDescription?.let { Text(it) }
                    Text(stringResource(R.string.order_from, d.pickup.address ?: d.pickup.contactName ?: ""), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.order_to, d.dropoff.address ?: d.dropoff.contactName ?: ""), style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        SectionTitle(stringResource(R.string.checkout_summary))
        Column(Modifier.padding(horizontal = 16.dp)) {
            if (order.subtotalBaisa > 0) LabelValueRow(stringResource(R.string.price_subtotal), money(order.subtotalBaisa))
            LabelValueRow(stringResource(R.string.price_delivery_fee), money(order.deliveryFeeBaisa))
            if (order.serviceFeeBaisa > 0) LabelValueRow(stringResource(R.string.price_service_fee), money(order.serviceFeeBaisa))
            if (order.discountBaisa > 0) LabelValueRow(stringResource(R.string.price_discount), "-" + money(order.discountBaisa))
            if (order.vatBaisa > 0) LabelValueRow(stringResource(R.string.price_vat), money(order.vatBaisa))
            HorizontalDivider(Modifier.padding(vertical = 6.dp))
            LabelValueRow(stringResource(R.string.price_total), money(order.totalBaisa), emphasize = true)
            LabelValueRow(stringResource(R.string.checkout_payment), paymentMethodLabel(order.paymentMethod))
            if (order.codAmountBaisa > 0) LabelValueRow(stringResource(R.string.order_cod_due), money(order.codAmountBaisa))
            order.cancelReason?.let { Text(stringResource(R.string.order_cancel_reason, it), color = MaterialTheme.colorScheme.error) }
        }

        if (order.timeline.isNotEmpty()) {
            SectionTitle(stringResource(R.string.order_timeline))
            Column(Modifier.padding(horizontal = 16.dp)) {
                order.timeline.sortedBy { it.at }.forEach { t ->
                    Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.Top) {
                        Text("●", color = QabnahColors.Primary, modifier = Modifier.width(20.dp))
                        Column {
                            Text(orderStatusLabel(t.status), style = MaterialTheme.typography.bodyMedium)
                            Text(dateTime(t.at), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            t.note?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (order.canRate && !ratingSaved) {
                Button(onClick = onRate, modifier = Modifier.fillMaxWidth(), enabled = !busy) { Text(stringResource(R.string.order_rate)) }
            }
            if (order.canProbablyCancel) {
                OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth(), enabled = !busy) {
                    Text(stringResource(R.string.order_cancel), color = MaterialTheme.colorScheme.error)
                }
            }
            OutlinedButton(onClick = onHelp, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.order_help)) }
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
        confirmButton = { TextButton(onClick = { onConfirm(reason) }, enabled = !busy) { Text(stringResource(R.string.order_cancel)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.order_keep)) } },
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
            TextButton(
                enabled = !busy && (captain > 0 || merchant > 0),
                onClick = { onSubmit(captain.takeIf { it > 0 }, captainComment, merchant.takeIf { it > 0 }, merchantComment) },
            ) { Text(stringResource(om.qabnah.android.R.string.common_send)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(om.qabnah.android.R.string.common_cancel)) } },
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
                    tint = QabnahColors.Accent,
                )
            }
        }
    }
}
