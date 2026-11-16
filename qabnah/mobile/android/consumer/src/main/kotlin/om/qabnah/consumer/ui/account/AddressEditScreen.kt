package om.qabnah.consumer.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.ui.components.LoadingState
import om.qabnah.android.ui.components.ProgressButton
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.map.PinPickerMap
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R

@Composable
fun AddressEditScreen(container: ConsumerContainer, addressId: String?, onBack: () -> Unit, onSaved: (String) -> Unit) {
    val vm: AddressEditViewModel = viewModel { AddressEditViewModel(container.account, addressId) }
    val f by vm.form.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.saved.collect(onSaved) }

    ScreenScaffold(title = stringResource(if (addressId == null) R.string.address_add else R.string.address_edit), onBack = onBack) { padding ->
        if (f.loading) {
            LoadingState(Modifier.padding(padding))
            return@ScreenScaffold
        }
        Column(Modifier.padding(padding).fillMaxSize().imePadding().verticalScroll(rememberScrollState())) {
            // The map keeps the pin in the centre; panning moves the address location.
            PinPickerMap(
                initial = f.location,
                onCenterChanged = { c -> vm.edit { it.copy(location = c) } },
                modifier = Modifier.fillMaxWidth().height(280.dp),
            )
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("home" to R.string.address_label_home, "work" to R.string.address_label_work, "other" to R.string.address_label_other).forEach { (key, label) ->
                        FilterChip(selected = f.label == key, onClick = { vm.edit { it.copy(label = key) } }, label = { Text(stringResource(label)) })
                    }
                }
                Field(f.area, R.string.address_area) { v -> vm.edit { it.copy(area = v) } }
                Field(f.street, R.string.address_street) { v -> vm.edit { it.copy(street = v) } }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field(f.building, R.string.address_building, Modifier.weight(1f)) { v -> vm.edit { it.copy(building = v) } }
                    Field(f.floor, R.string.address_floor, Modifier.weight(1f)) { v -> vm.edit { it.copy(floor = v) } }
                    Field(f.apartment, R.string.address_apartment, Modifier.weight(1f)) { v -> vm.edit { it.copy(apartment = v) } }
                }
                Field(f.landmark, R.string.address_landmark) { v -> vm.edit { it.copy(landmark = v) } }
                Field(f.contactName, R.string.send_contact_name) { v -> vm.edit { it.copy(contactName = v) } }
                Field(f.contactPhone, R.string.send_contact_phone, keyboard = KeyboardType.Phone) { v -> vm.edit { it.copy(contactPhone = v) } }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.address_make_default), modifier = Modifier.weight(1f))
                    Switch(checked = f.isDefault, onCheckedChange = { c -> vm.edit { it.copy(isDefault = c) } })
                }
                if (f.location == null) Text(stringResource(R.string.address_move_map), color = MaterialTheme.colorScheme.onSurfaceVariant)
                f.error?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error) }
                ProgressButton(stringResource(om.qabnah.android.R.string.common_save), onClick = vm::save, enabled = f.location != null, loading = f.saving)
            }
        }
    }
}

@Composable
private fun Field(
    value: String,
    label: Int,
    modifier: Modifier = Modifier.fillMaxWidth(),
    keyboard: KeyboardType = KeyboardType.Text,
    onChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(it.take(120)) },
        label = { Text(stringResource(label)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        modifier = modifier,
    )
}
