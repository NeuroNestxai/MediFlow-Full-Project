package om.qabnah.consumer.ui.checkout

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddLocationAlt
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Fastfood
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.locale.isArabic
import om.qabnah.android.ui.components.EmptyState
import om.qabnah.android.ui.components.InlineError
import om.qabnah.android.ui.components.PriceRow
import om.qabnah.android.ui.components.QBottomActionBar
import om.qabnah.android.ui.components.QButton
import om.qabnah.android.ui.components.QCard
import om.qabnah.android.ui.components.QOptionRow
import om.qabnah.android.ui.components.QPhoto
import om.qabnah.android.ui.components.QPrice
import om.qabnah.android.ui.components.QSecondaryButton
import om.qabnah.android.ui.components.QStepper
import om.qabnah.android.ui.components.QTextButton
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.SkeletonBox
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.distance
import om.qabnah.android.ui.components.durationMinutes
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.loc
import om.qabnah.android.ui.components.paymentMethodLabel
import om.qabnah.android.ui.components.priceText
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.consumer.ui.components.StepHeader
import om.qabnah.core.model.Order
import om.qabnah.core.model.PaymentMethod
import om.qabnah.core.model.PriceBreakdown

/** Checkout in four steps on one page: cart → deliver to → payment → summary, with a sticky "place order" bar. */
@Composable
fun CheckoutScreen(
    container: ConsumerContainer,
    newAddressId: String?,
    onBack: () -> Unit,
    onAddAddress: () -> Unit,
    onPlaced: (Order) -> Unit,
) {
    val vm: CheckoutViewModel = viewModel { CheckoutViewModel(container.cart, container.orders, container.account) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.placed.collect(onPlaced) }
    LaunchedEffect(newAddressId) { if (newAddressId != null) vm.loadAddresses(selectId = newAddressId) }

    ScreenScaffold(
        title = stringResource(R.string.checkout_title),
        onBack = onBack,
        bottomBar = {
            if (!ui.cart.isEmpty) {
                QBottomActionBar {
                    ui.placeError?.let {
                        Text(errorMessage(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 8.dp))
                    }
                    QButton(onClick = vm::place, enabled = ui.canPlace, loading = ui.placing, modifier = Modifier.fillMaxWidth()) {
                        val total = ui.quote?.totalBaisa
                        Text(stringResource(R.string.checkout_place_no_total), modifier = Modifier.weight(1f))
                        if (total != null) Text(priceText(total))
                    }
                }
            }
        },
    ) { padding ->
        if (ui.cart.isEmpty) {
            EmptyState(stringResource(R.string.cart_empty), modifier = Modifier.padding(padding))
            return@ScreenScaffold
        }
        Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState())) {
            val merchant = ui.cart.merchant

            // 1 · Cart
            StepHeader(1, merchant?.let { loc(it.nameEn, it.nameAr) } ?: stringResource(R.string.order_items))
            QCard(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), padding = PaddingValues(0.dp)) {
                ui.cart.lines.forEachIndexed { index, line ->
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        QPhoto(
                            url = line.imageUrl,
                            contentDescription = null,
                            glyph = Icons.Outlined.Fastfood,
                            modifier = Modifier.size(width = 72.dp, height = 54.dp),
                            shape = MaterialTheme.shapes.small,
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(loc(line.nameEn, line.nameAr), style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            val opts = (if (isArabic()) line.optionNamesAr else line.optionNamesEn).filter { it.isNotBlank() }
                            if (opts.isNotEmpty()) {
                                Text(opts.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            line.notes?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            QPrice(line.lineTotalBaisa, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 2.dp))
                        }
                        Spacer(Modifier.width(8.dp))
                        QStepper(
                            value = digits(line.quantity.toString()),
                            onDecrease = { vm.setQuantity(index, line.quantity - 1) },
                            onIncrease = { vm.setQuantity(index, line.quantity + 1) },
                            decreaseDescription = stringResource(R.string.qty_decrease),
                            increaseDescription = stringResource(R.string.qty_increase),
                        )
                    }
                    if (index != ui.cart.lines.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 12.dp))
                }
            }
            if (!ui.cart.meetsMinimum) {
                WarningRow(stringResource(R.string.checkout_below_minimum, om.qabnah.android.ui.components.money(ui.cart.shortOfMinimumBaisa)))
            }
            if (merchant != null && !merchant.isOpen) WarningRow(stringResource(R.string.store_closed_notice))

            // 2 · Deliver to
            StepHeader(2, stringResource(R.string.checkout_deliver_to))
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                when {
                    ui.addresses.isInitialLoading -> SkeletonBox(Modifier.fillMaxWidth().height(64.dp))
                    ui.addresses.showFullError -> InlineError(ui.addresses.error!!, onRetry = { vm.loadAddresses() })
                    else -> ui.addresses.data.orEmpty().forEach { a ->
                        val enabled = a.isInServiceArea
                        val selected = ui.selectedAddressId == a.id
                        QOptionRow(
                            selected = selected,
                            onClick = { vm.selectAddress(a.id) },
                            enabled = enabled,
                            leading = { Icon(Icons.Outlined.Place, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                            trailing = { RadioButton(selected = selected, onClick = null, enabled = enabled) },
                        ) {
                            Text(a.label?.takeIf { it.isNotBlank() } ?: stringResource(R.string.address_untitled), style = MaterialTheme.typography.titleSmall)
                            Text(a.summary(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (!enabled) {
                                Text(stringResource(om.qabnah.android.R.string.error_out_of_service_area), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }
                QSecondaryButton(stringResource(R.string.checkout_add_address), onClick = onAddAddress, icon = Icons.Outlined.AddLocationAlt, modifier = Modifier.fillMaxWidth())
            }

            // 3 · Payment
            StepHeader(3, stringResource(R.string.checkout_payment))
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (ui.availableMethods.isEmpty()) WarningRow(stringResource(R.string.checkout_no_payment_methods), padded = false)
                ui.availableMethods.forEach { m ->
                    val selected = ui.paymentMethod == m
                    QOptionRow(
                        selected = selected,
                        onClick = { vm.selectPayment(m) },
                        leading = {
                            Icon(
                                if (m == PaymentMethod.COD) Icons.Outlined.Payments else Icons.Outlined.CreditCard,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        },
                        trailing = { RadioButton(selected = selected, onClick = null) },
                    ) {
                        Text(paymentMethodLabel(m), style = MaterialTheme.typography.titleSmall)
                    }
                }
                OutlinedTextField(
                    value = ui.notes,
                    onValueChange = vm::setNotes,
                    label = { Text(stringResource(R.string.checkout_notes)) },
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    maxLines = 3,
                )
            }

            // 4 · Summary
            StepHeader(4, stringResource(R.string.checkout_summary))
            Column(Modifier.padding(horizontal = 16.dp)) {
                when {
                    ui.quoting -> SkeletonBox(Modifier.fillMaxWidth().height(120.dp), MaterialTheme.shapes.medium)
                    ui.quoteError != null -> {
                        Text(errorMessage(ui.quoteError!!), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                        QTextButton(stringResource(om.qabnah.android.R.string.common_retry), onClick = vm::retryQuote)
                    }
                    ui.quote != null -> PriceBreakdownCard(ui.quote!!)
                    else -> Text(stringResource(R.string.checkout_select_address_first), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun WarningRow(text: String, padded: Boolean = true) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = if (padded) 16.dp else 0.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
        Text(text, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 8.dp))
    }
}

@Composable
fun PriceBreakdownCard(q: PriceBreakdown) {
    QCard(Modifier.fillMaxWidth()) {
        PriceRow(stringResource(R.string.price_subtotal), q.subtotalBaisa)
        PriceRow(stringResource(R.string.price_delivery_fee), q.deliveryFeeBaisa)
        if (q.serviceFeeBaisa > 0) PriceRow(stringResource(R.string.price_service_fee), q.serviceFeeBaisa)
        if (q.discountBaisa > 0) PriceRow(stringResource(R.string.price_discount), q.discountBaisa, negative = true)
        if (q.vatBaisa > 0) {
            PriceRow(stringResource(if (q.vatIncluded) R.string.price_vat_included else R.string.price_vat), q.vatBaisa)
        }
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        PriceRow(stringResource(R.string.price_total), q.totalBaisa, emphasize = true)
        if (q.distanceM > 0) {
            Text(
                stringResource(R.string.price_distance_eta, distance(q.distanceM), durationMinutes(q.estimatedDurationS)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
