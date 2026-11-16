package om.qabnah.consumer.ui.send

import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EditLocationAlt
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.ui.components.LabelValueRow
import om.qabnah.android.ui.components.ProgressButton
import om.qabnah.android.ui.components.SectionTitle
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.distance
import om.qabnah.android.ui.components.durationMinutes
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.components.paymentMethodLabel
import om.qabnah.android.ui.map.PinPickerDialog
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.core.model.CodPayer
import om.qabnah.core.model.Order
import om.qabnah.core.model.PackageSize
import om.qabnah.core.model.PaymentMethod

@Composable
fun SendScreen(container: ConsumerContainer, onCreated: (Order) -> Unit) {
    val vm: SendViewModel = viewModel { SendViewModel(container.orders, container.account) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    var picking by rememberSaveable { mutableStateOf<Side?>(null) }
    LaunchedEffect(Unit) { vm.created.collect(onCreated) }

    Column(Modifier.fillMaxSize().statusBarsPadding().imePadding().verticalScroll(rememberScrollState())) {
        Text(stringResource(R.string.send_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(16.dp))
        Text(stringResource(R.string.send_subtitle), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp))

        PlaceSection(stringResource(R.string.send_pickup), ui.pickup, ui.showValidation, onPick = { picking = Side.PICKUP }) { t -> vm.update(Side.PICKUP, t) }
        PlaceSection(stringResource(R.string.send_dropoff), ui.dropoff, ui.showValidation, onPick = { picking = Side.DROPOFF }) { t -> vm.update(Side.DROPOFF, t) }

        SectionTitle(stringResource(R.string.send_package))
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                PackageSize.selectable.forEachIndexed { i, size ->
                    SegmentedButton(
                        selected = ui.size == size,
                        onClick = { vm.setSize(size) },
                        shape = SegmentedButtonDefaults.itemShape(i, PackageSize.selectable.size),
                    ) { Text(packageSizeLabel(size)) }
                }
            }
            Text(packageSizeHint(ui.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                suffix = { Text("OMR") },
                isError = ui.declaredValueInvalid,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
        }

        SectionTitle(stringResource(R.string.checkout_payment))
        listOf(PaymentMethod.ONLINE, PaymentMethod.COD).forEach { m ->
            Row(
                Modifier.fillMaxWidth().clickable(role = Role.RadioButton) { vm.setPayment(m) }.padding(horizontal = 8.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RadioButton(selected = ui.paymentMethod == m, onClick = null)
                Text(paymentMethodLabel(m), modifier = Modifier.padding(start = 8.dp))
            }
        }
        if (ui.paymentMethod == PaymentMethod.COD) {
            Text(stringResource(R.string.send_cod_payer), style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(start = 16.dp, top = 4.dp))
            listOf(CodPayer.SENDER, CodPayer.RECIPIENT).forEach { p ->
                Row(
                    Modifier.fillMaxWidth().clickable(role = Role.RadioButton) { vm.setCodPayer(p) }.padding(start = 24.dp, top = 2.dp, bottom = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = ui.codPayer == p, onClick = null)
                    Text(
                        stringResource(if (p == CodPayer.SENDER) R.string.send_cod_sender else R.string.send_cod_recipient),
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
        }

        SectionTitle(stringResource(R.string.checkout_summary))
        Column(Modifier.padding(horizontal = 16.dp)) {
            when {
                ui.quoting -> CircularProgressIndicator(Modifier.size(24.dp))
                ui.quoteError != null -> {
                    Text(errorMessage(ui.quoteError!!), color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = vm::requote) { Text(stringResource(om.qabnah.android.R.string.common_retry)) }
                }
                ui.quote != null -> Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        LabelValueRow(stringResource(R.string.price_delivery_fee), money(ui.quote!!.feeBaisa), emphasize = true)
                        Text(
                            stringResource(R.string.price_distance_eta, distance(ui.quote!!.distanceM), durationMinutes(ui.quote!!.estimatedDurationS)),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
                else -> Text(stringResource(R.string.send_set_both_pins), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            ui.submitError?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
            if (ui.showValidation && !ui.isValid) {
                Text(stringResource(R.string.send_fix_fields), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
            }
            Spacer(Modifier.height(12.dp))
            ProgressButton(
                text = ui.quote?.let { stringResource(R.string.send_submit, money(it.feeBaisa)) } ?: stringResource(R.string.send_submit_no_price),
                onClick = vm::submit,
                enabled = !ui.submitting && !ui.quoting,
                loading = ui.submitting,
            )
            Spacer(Modifier.height(24.dp))
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
private fun PlaceSection(
    title: String,
    draft: PlaceDraft,
    showValidation: Boolean,
    onPick: () -> Unit,
    onChange: ((PlaceDraft) -> PlaceDraft) -> Unit,
) {
    SectionTitle(title)
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = onPick, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.EditLocationAlt, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text(
                draft.location?.let { digits(String.format(java.util.Locale.US, "%.5f, %.5f", it.lat, it.lng)) }
                    ?: stringResource(R.string.send_set_on_map),
            )
        }
        if (showValidation && draft.location == null) Text(stringResource(R.string.send_location_required), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
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
