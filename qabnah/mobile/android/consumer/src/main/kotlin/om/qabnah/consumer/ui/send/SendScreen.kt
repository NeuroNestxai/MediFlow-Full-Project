package om.qabnah.consumer.ui.send

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.EditLocationAlt
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Mail
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.locale.isArabic
import om.qabnah.android.ui.components.QButton
import om.qabnah.android.ui.components.QCard
import om.qabnah.android.ui.components.QLargeTitle
import om.qabnah.android.ui.components.QOptionRow
import om.qabnah.android.ui.components.QPrice
import om.qabnah.android.ui.components.QSecondaryButton
import om.qabnah.android.ui.components.QStepProgress
import om.qabnah.android.ui.components.QTextButton
import om.qabnah.android.ui.components.SkeletonBox
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.distance
import om.qabnah.android.ui.components.durationMinutes
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.paymentMethodLabel
import om.qabnah.android.ui.components.priceText
import om.qabnah.android.ui.map.PinPickerDialog
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.core.model.CodPayer
import om.qabnah.core.model.Order
import om.qabnah.core.model.PackageSize
import om.qabnah.core.model.PaymentMethod
import om.qabnah.core.money.Money

private const val STEPS = 3

/** Send a parcel as a three-step wizard: 1 pickup and drop-off · 2 package · 3 payment and review. */
@Composable
fun SendScreen(container: ConsumerContainer, onCreated: (Order) -> Unit) {
    val vm: SendViewModel = viewModel { SendViewModel(container.orders, container.account) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    var picking by rememberSaveable { mutableStateOf<Side?>(null) }
    var step by rememberSaveable { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        vm.created.collect {
            step = 0
            onCreated(it)
        }
    }

    Column(Modifier.fillMaxSize().statusBarsPadding().imePadding()) {
        QLargeTitle(stringResource(R.string.send_title), subtitle = stringResource(R.string.send_subtitle))
        Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
            QStepProgress(STEPS, step)
            Text(
                stringResource(R.string.send_step_of, digits((step + 1).toString()), digits(STEPS.toString())) + "  ·  " +
                    stringResource(
                        when (step) {
                            0 -> R.string.send_step_places
                            1 -> R.string.send_package
                            else -> R.string.send_step_review
                        },
                    ),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when (step) {
                0 -> {
                    PlaceCard(stringResource(R.string.send_pickup), om.qabnah.android.R.drawable.ic_pin_pickup, ui.pickup, ui.showValidation, onPick = { picking = Side.PICKUP }) { t -> vm.update(Side.PICKUP, t) }
                    PlaceCard(stringResource(R.string.send_dropoff), om.qabnah.android.R.drawable.ic_pin_dropoff, ui.dropoff, ui.showValidation, onPick = { picking = Side.DROPOFF }) { t -> vm.update(Side.DROPOFF, t) }
                }
                1 -> PackageStep(ui, vm)
                else -> ReviewStep(ui, vm)
            }
            val stepIncomplete = when (step) {
                0 -> !ui.placesComplete
                1 -> !ui.packageComplete
                else -> !ui.isValid
            }
            if (ui.showValidation && stepIncomplete) {
                Text(stringResource(R.string.send_fix_fields), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(4.dp))
        }

        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (step > 0) {
                QSecondaryButton(stringResource(om.qabnah.android.R.string.common_back), onClick = { step -= 1 }, enabled = !ui.submitting)
            }
            if (step < STEPS - 1) {
                QButton(
                    stringResource(om.qabnah.android.R.string.common_continue),
                    onClick = {
                        val ok = if (step == 0) ui.placesComplete else ui.packageComplete
                        if (ok) step += 1 else vm.showValidation()
                    },
                    modifier = Modifier.weight(1f),
                )
            } else {
                QButton(onClick = vm::submit, enabled = !ui.submitting && !ui.quoting, loading = ui.submitting, modifier = Modifier.weight(1f)) {
                    val fee = ui.quote?.feeBaisa
                    Text(stringResource(R.string.send_submit_no_price), modifier = Modifier.weight(1f))
                    if (fee != null) Text(priceText(fee))
                }
            }
        }
    }

    picking?.let { side ->
        val current = if (side == Side.PICKUP) ui.pickup.location else ui.dropoff.location
        PinPickerDialog(
            title = stringResource(if (side == Side.PICKUP) R.string.send_pickup else R.string.send_dropoff),
            initial = current,
            onDismiss = { picking = null },
            onPicked = {
                vm.setLocation(side, it)
                picking = null
            },
        )
    }
}

@Composable
private fun PlaceCard(
    title: String,
    pin: Int,
    draft: PlaceDraft,
    showValidation: Boolean,
    onPick: () -> Unit,
    onChange: ((PlaceDraft) -> PlaceDraft) -> Unit,
) {
    QCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(painterResource(pin), contentDescription = null, tint = androidx.compose.ui.graphics.Color.Unspecified, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(8.dp))
            Text(title, style = MaterialTheme.typography.titleMedium)
        }
        Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val located = draft.location != null
            QSecondaryButton(
                stringResource(if (located) R.string.send_location_set else R.string.send_set_on_map),
                onClick = onPick,
                icon = if (located) Icons.Outlined.CheckCircle else Icons.Outlined.EditLocationAlt,
                modifier = Modifier.fillMaxWidth(),
            )
            if (showValidation && !located) {
                Text(stringResource(R.string.send_location_required), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            OutlinedTextField(
                value = draft.address,
                onValueChange = { v -> onChange { it.copy(address = v.take(200)) } },
                label = { Text(stringResource(R.string.send_address_details)) },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = draft.contactName,
                onValueChange = { v -> onChange { it.copy(contactName = v.take(80)) } },
                label = { Text(stringResource(R.string.send_contact_name)) },
                isError = showValidation && draft.contactName.isBlank(),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = draft.contactPhone,
                onValueChange = { v -> onChange { it.copy(contactPhone = v.take(16)) } },
                label = { Text(stringResource(R.string.send_contact_phone)) },
                prefix = { Text("+968 ") },
                isError = showValidation && draft.phoneE164 == null,
                supportingText = if (showValidation && draft.phoneE164 == null) { { Text(stringResource(om.qabnah.android.R.string.auth_phone_invalid)) } } else null,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                textStyle = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = draft.notes,
                onValueChange = { v -> onChange { it.copy(notes = v.take(200)) } },
                label = { Text(stringResource(R.string.send_notes)) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun PackageStep(ui: SendUi, vm: SendViewModel) {
    PackageSize.selectable.forEach { size ->
        val selected = ui.size == size
        QOptionRow(
            selected = selected,
            onClick = { vm.setSize(size) },
            leading = { Icon(packageGlyph(size), contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(28.dp)) },
            trailing = { RadioButton(selected = selected, onClick = null) },
        ) {
            Text(packageSizeLabel(size), style = MaterialTheme.typography.titleSmall)
            Text(packageSizeHint(size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    OutlinedTextField(
        value = ui.description,
        onValueChange = vm::setDescription,
        label = { Text(stringResource(R.string.send_description)) },
        isError = ui.showValidation && ui.description.isBlank(),
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = ui.declaredValue,
        onValueChange = vm::setDeclaredValue,
        label = { Text(stringResource(R.string.send_declared_value)) },
        suffix = { Text(if (isArabic()) Money.AR_CURRENCY else "OMR") },
        isError = ui.declaredValueInvalid,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun ReviewStep(ui: SendUi, vm: SendViewModel) {
    Text(stringResource(R.string.checkout_payment), style = MaterialTheme.typography.titleMedium)
    listOf(PaymentMethod.ONLINE, PaymentMethod.COD).forEach { m ->
        val selected = ui.paymentMethod == m
        QOptionRow(
            selected = selected,
            onClick = { vm.setPayment(m) },
            leading = { Icon(if (m == PaymentMethod.COD) Icons.Outlined.Payments else Icons.Outlined.CreditCard, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
            trailing = { RadioButton(selected = selected, onClick = null) },
        ) {
            Text(paymentMethodLabel(m), style = MaterialTheme.typography.titleSmall)
        }
    }
    if (ui.paymentMethod == PaymentMethod.COD) {
        Text(stringResource(R.string.send_cod_payer), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 4.dp))
        listOf(CodPayer.SENDER, CodPayer.RECIPIENT).forEach { p ->
            val selected = ui.codPayer == p
            QOptionRow(selected = selected, onClick = { vm.setCodPayer(p) }, trailing = { RadioButton(selected = selected, onClick = null) }) {
                Text(stringResource(if (p == CodPayer.SENDER) R.string.send_cod_sender else R.string.send_cod_recipient), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }

    Text(stringResource(R.string.checkout_summary), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
    val quote = ui.quote
    when {
        ui.quoting -> SkeletonBox(Modifier.fillMaxWidth().height(88.dp), MaterialTheme.shapes.medium)
        ui.quoteError != null -> {
            Text(errorMessage(ui.quoteError), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            QTextButton(stringResource(om.qabnah.android.R.string.common_retry), onClick = vm::requote)
        }
        quote != null -> QCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.price_delivery_fee), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                QPrice(quote.feeBaisa, style = MaterialTheme.typography.titleLarge)
            }
            Text(
                stringResource(R.string.price_distance_eta, distance(quote.distanceM), durationMinutes(quote.estimatedDurationS)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        else -> Text(stringResource(R.string.send_set_both_pins), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
    }
    ui.submitError?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
}

private fun packageGlyph(size: PackageSize): ImageVector = when (size) {
    PackageSize.SMALL -> Icons.Outlined.Mail
    PackageSize.MEDIUM -> Icons.Outlined.Inventory2
    PackageSize.LARGE, PackageSize.UNKNOWN -> Icons.Outlined.LocalShipping
}

@Composable
private fun packageSizeLabel(size: PackageSize): String = stringResource(
    when (size) {
        PackageSize.SMALL -> R.string.package_small
        PackageSize.MEDIUM -> R.string.package_medium
        PackageSize.LARGE, PackageSize.UNKNOWN -> R.string.package_large
    },
)

@Composable
private fun packageSizeHint(size: PackageSize): String = stringResource(
    when (size) {
        PackageSize.SMALL -> R.string.package_small_hint
        PackageSize.MEDIUM -> R.string.package_medium_hint
        PackageSize.LARGE, PackageSize.UNKNOWN -> R.string.package_large_hint
    },
)
