package om.qabnah.consumer.ui.checkout

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddLocationAlt
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.locale.isArabic
import om.qabnah.android.ui.components.EmptyState
import om.qabnah.android.ui.components.InlineError
import om.qabnah.android.ui.components.LabelValueRow
import om.qabnah.android.ui.components.ProgressButton
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.SectionTitle
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.distance
import om.qabnah.android.ui.components.durationMinutes
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.loc
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.components.paymentMethodLabel
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.core.model.Order
import om.qabnah.core.model.PriceBreakdown

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
                Column(Modifier.navigationBarsPadding().padding(16.dp)) {
                    ui.placeError?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 8.dp)) }
                    ProgressButton(
                        text = ui.quote?.let { stringResource(R.string.checkout_place, money(it.totalBaisa)) } ?: stringResource(R.string.checkout_place_no_total),
                        onClick = vm::place,
                        enabled = ui.canPlace,
                        loading = ui.placing,
                    )
                }
            }
        },
    ) { padding ->
        if (ui.cart.isEmpty) {
            EmptyState(stringResource(R.string.cart_empty), modifier = Modifier.padding(padding), icon = Icons.Filled.ShoppingBag)
            return@ScreenScaffold
        }
        Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState())) {
            val merchant = ui.cart.merchant
            SectionTitle(merchant?.let { loc(it.nameEn, it.nameAr) } ?: "")
            ui.cart.lines.forEachIndexed { index, line ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(loc(line.nameEn, line.nameAr), style = MaterialTheme.typography.bodyLarge)
                        val opts = (if (isArabic()) line.optionNamesAr else line.optionNamesEn)
                            .filter { it.isNotBlank() }
                        if (opts.isNotEmpty()) Text(opts.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        line.notes?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        Text(money(line.lineTotalBaisa), style = MaterialTheme.typography.labelLarge)
                    }
                    IconButton(onClick = { vm.setQuantity(index, line.quantity - 1) }) {
                        Icon(Icons.Filled.Remove, contentDescription = stringResource(R.string.qty_decrease))
                    }
                    Text(digits(line.quantity.toString()), style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { vm.setQuantity(index, line.quantity + 1) }) {
                        Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.qty_increase))
                    }
                }
            }
            if (!ui.cart.meetsMinimum) {
                WarningRow(stringResource(R.string.checkout_below_minimum, money(ui.cart.shortOfMinimumBaisa)))
            }
            if (merchant != null && !merchant.isOpen) WarningRow(stringResource(R.string.store_closed_notice))

            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            SectionTitle(stringResource(R.string.checkout_deliver_to))
            when {
                ui.addresses.isInitialLoading -> Row(Modifier.padding(16.dp)) { CircularProgressIndicator(Modifier.size(24.dp)) }
                ui.addresses.showFullError -> InlineError(ui.addresses.error!!, onRetry = { vm.loadAddresses() })
                else -> ui.addresses.data.orEmpty().forEach { a ->
                    val enabled = a.isInServiceArea
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable(enabled = enabled, role = Role.RadioButton) { vm.selectAddress(a.id) }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = ui.selectedAddressId == a.id, onClick = null, enabled = enabled)
                        Column(Modifier.padding(start = 8.dp)) {
                            Text(a.label?.takeIf { it.isNotBlank() } ?: stringResource(R.string.address_untitled), style = MaterialTheme.typography.bodyLarge)
                            Text(a.summary(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (!enabled) Text(stringResource(om.qabnah.android.R.string.error_out_of_service_area), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
            OutlinedButton(onClick = onAddAddress, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                Icon(Icons.Filled.AddLocationAlt, contentDescription = null)
                Text(stringResource(R.string.checkout_add_address), modifier = Modifier.padding(start = 8.dp))
            }

            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            SectionTitle(stringResource(R.string.checkout_payment))
            if (ui.availableMethods.isEmpty()) WarningRow(stringResource(R.string.checkout_no_payment_methods))
            ui.availableMethods.forEach { m ->
                Row(
                    Modifier.fillMaxWidth().clickable(role = Role.RadioButton) { vm.selectPayment(m) }.padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = ui.paymentMethod == m, onClick = null)
                    Text(paymentMethodLabel(m), modifier = Modifier.padding(start = 8.dp))
                }
            }
            OutlinedTextField(
                value = ui.notes,
                onValueChange = vm::setNotes,
                label = { Text(stringResource(R.string.checkout_notes)) },
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                maxLines = 3,
            )

            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            SectionTitle(stringResource(R.string.checkout_summary))
            Column(Modifier.padding(horizontal = 16.dp)) {
                when {
                    ui.quoting -> CircularProgressIndicator(Modifier.size(24.dp))
                    ui.quoteError != null -> {
                        Text(errorMessage(ui.quoteError!!), color = MaterialTheme.colorScheme.error)
                        TextButton(onClick = vm::retryQuote) { Text(stringResource(om.qabnah.android.R.string.common_retry)) }
                    }
                    ui.quote != null -> PriceBreakdownCard(ui.quote!!)
                    else -> Text(stringResource(R.string.checkout_select_address_first), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun WarningRow(text: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
        Text(text, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp))
    }
}

@Composable
fun PriceBreakdownCard(q: PriceBreakdown) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            LabelValueRow(stringResource(R.string.price_subtotal), money(q.subtotalBaisa))
            LabelValueRow(stringResource(R.string.price_delivery_fee), money(q.deliveryFeeBaisa))
            if (q.serviceFeeBaisa > 0) LabelValueRow(stringResource(R.string.price_service_fee), money(q.serviceFeeBaisa))
            if (q.discountBaisa > 0) LabelValueRow(stringResource(R.string.price_discount), "-" + money(q.discountBaisa))
            if (q.vatBaisa > 0) {
                LabelValueRow(
                    stringResource(if (q.vatIncluded) R.string.price_vat_included else R.string.price_vat),
                    money(q.vatBaisa),
                )
            }
            HorizontalDivider(Modifier.padding(vertical = 6.dp))
            LabelValueRow(stringResource(R.string.price_total), money(q.totalBaisa), emphasize = true)
            if (q.distanceM > 0) {
                Text(
                    stringResource(R.string.price_distance_eta, distance(q.distanceM), durationMinutes(q.estimatedDurationS)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
