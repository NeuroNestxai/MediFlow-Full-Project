package om.qabnah.captain.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.ui.components.ProgressButton
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.SectionTitle
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.vehicleLabel
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.core.model.VehicleType
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** Captain registration (first run) and later vehicle / payout edits. */
@Composable
fun ProfileFormScreen(container: CaptainContainer, editing: Boolean, onBack: (() -> Unit)?, onDone: () -> Unit) {
    val vm: ProfileFormViewModel = viewModel(key = "profile-form-$editing") { ProfileFormViewModel(container.captain, editing) }
    val f by vm.form.collectAsStateWithLifecycle()
    var pickingDob by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) { vm.done.collect { onDone() } }

    ScreenScaffold(title = stringResource(if (editing) R.string.profile_vehicle_payout else R.string.register_title), onBack = onBack) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (!editing) Text(stringResource(R.string.register_intro), style = MaterialTheme.typography.bodyMedium)
            if (vm.warnsReview) Text(stringResource(R.string.register_edit_review_warning), color = MaterialTheme.colorScheme.error)

            SectionTitle(stringResource(R.string.register_vehicle), Modifier.padding(0.dp))
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                VehicleType.selectable.forEachIndexed { i, v ->
                    SegmentedButton(
                        selected = f.vehicleType == v,
                        onClick = { vm.edit { it.copy(vehicleType = v) } },
                        shape = SegmentedButtonDefaults.itemShape(i, VehicleType.selectable.size),
                    ) { Text(vehicleLabel(v)) }
                }
            }
            FormField(f.vehicleMake, R.string.register_make, "vehicleMake", f, required = true) { v -> vm.edit { it.copy(vehicleMake = v) } }
            FormField(f.vehicleModel, R.string.register_model, "vehicleModel", f, required = true) { v -> vm.edit { it.copy(vehicleModel = v) } }
            FormField(f.vehiclePlate, R.string.register_plate, "vehiclePlate", f, required = true, caps = true) { v -> vm.edit { it.copy(vehiclePlate = v) } }
            FormField(f.vehicleColor, R.string.register_color, "vehicleColor", f) { v -> vm.edit { it.copy(vehicleColor = v) } }

            SectionTitle(stringResource(R.string.register_identity), Modifier.padding(0.dp))
            FormField(f.nationalIdNumber, R.string.register_national_id, "nationalIdNumber", f, required = true, keyboard = KeyboardType.Number) { v -> vm.edit { it.copy(nationalIdNumber = v) } }
            FormField(f.nationality, R.string.register_nationality, "nationality", f, required = true) { v -> vm.edit { it.copy(nationality = v) } }
            val dobError = f.fieldErrors["dateOfBirth"]
            OutlinedTextField(
                value = f.dateOfBirth,
                onValueChange = {},
                readOnly = true,
                label = { Text(stringResource(R.string.register_dob)) },
                isError = (f.showValidation && f.dateOfBirth.isBlank()) || "dateOfBirth" in f.fieldErrors,
                supportingText = if (dobError != null) { { Text(dobError) } } else null,
                trailingIcon = {
                    IconButton(onClick = { pickingDob = true }) { Icon(Icons.Filled.CalendarMonth, contentDescription = stringResource(R.string.register_pick_date)) }
                },
                textStyle = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr),
                modifier = Modifier.fillMaxWidth(),
            )

            SectionTitle(stringResource(R.string.register_payout), Modifier.padding(0.dp))
            FormField(f.bankName, R.string.register_bank, "bankName", f) { v -> vm.edit { it.copy(bankName = v) } }
            OutlinedTextField(
                value = f.iban,
                onValueChange = { v -> vm.edit { it.copy(iban = v.take(42)) } },
                label = { Text(stringResource(R.string.register_iban)) },
                isError = !f.ibanValid || "iban" in f.fieldErrors,
                supportingText = { Text(f.fieldErrors["iban"] ?: stringResource(if (f.ibanValid) R.string.register_iban_hint else R.string.register_iban_invalid)) },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                textStyle = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            if (f.showValidation && f.missingRequired) Text(stringResource(R.string.register_required_missing), color = MaterialTheme.colorScheme.error)
            f.error?.let { if (f.fieldErrors.isEmpty()) Text(errorMessage(it), color = MaterialTheme.colorScheme.error) }
            ProgressButton(
                stringResource(if (editing) om.qabnah.android.R.string.common_save else R.string.register_submit),
                onClick = vm::submit,
                loading = f.submitting,
            )
        }
    }

    if (pickingDob) {
        val initialMs = runCatching { LocalDate.parse(f.dateOfBirth).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }.getOrNull()
        val state = rememberDatePickerState(initialSelectedDateMillis = initialMs)
        DatePickerDialog(
            onDismissRequest = { pickingDob = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms ->
                        val date = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()
                        vm.edit { it.copy(dateOfBirth = date.toString()) }
                    }
                    pickingDob = false
                }) { Text(stringResource(om.qabnah.android.R.string.common_ok)) }
            },
            dismissButton = { TextButton(onClick = { pickingDob = false }) { Text(stringResource(om.qabnah.android.R.string.common_cancel)) } },
        ) {
            DatePicker(state = state)
        }
    }
}

@Composable
private fun FormField(
    value: String,
    label: Int,
    key: String,
    form: ProfileForm,
    required: Boolean = false,
    caps: Boolean = false,
    keyboard: KeyboardType = KeyboardType.Text,
    onChange: (String) -> Unit,
) {
    val serverError = form.fieldErrors[key]
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(it.take(60)) },
        label = { Text(stringResource(label) + if (required) " *" else "") },
        isError = (required && form.showValidation && value.isBlank()) || serverError != null,
        supportingText = if (serverError != null) { { Text(serverError) } } else null,
        keyboardOptions = KeyboardOptions(
            keyboardType = keyboard,
            capitalization = if (caps) KeyboardCapitalization.Characters else KeyboardCapitalization.Words,
        ),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}

