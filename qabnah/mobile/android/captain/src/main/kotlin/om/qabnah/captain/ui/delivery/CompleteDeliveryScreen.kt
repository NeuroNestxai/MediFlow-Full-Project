package om.qabnah.captain.ui.delivery

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import android.net.Uri
import coil.compose.AsyncImage
import om.qabnah.android.ui.components.ErrorState
import om.qabnah.android.ui.components.LoadingState
import om.qabnah.android.ui.components.ProgressButton
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.util.UploadReader
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.captain.ui.onboarding.newCaptureUri

@Composable
fun CompleteDeliveryScreen(container: CaptainContainer, deliveryId: String, onBack: () -> Unit, onDone: () -> Unit) {
    val context = LocalContext.current
    val vm: CompleteDeliveryViewModel = viewModel {
        val app = context.applicationContext
        CompleteDeliveryViewModel(container.captain, container.services.location, container.locationReporter, { UploadReader.read(app, it, maxDimension = 1600) }, deliveryId)
    }
    val ui by vm.ui.collectAsStateWithLifecycle()
    var pendingUri by rememberSaveable { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = pendingUri
        if (ok && uri != null) vm.onPhotoTaken(uri)
    }
    LaunchedEffect(Unit) { vm.done.collect { onDone() } }

    ScreenScaffold(title = stringResource(R.string.complete_title), onBack = onBack) { padding ->
        val d = ui.delivery
        when {
            d == null && ui.loadError != null -> ErrorState(ui.loadError!!, onRetry = vm::load, modifier = Modifier.padding(padding))
            d == null -> LoadingState(Modifier.padding(padding))
            else -> Column(
                Modifier.padding(padding).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (d.pinRequired) {
                    Text(stringResource(R.string.complete_pin_hint), style = MaterialTheme.typography.bodyMedium)
                    val pinError = ui.fieldErrors["pin"]
                    OutlinedTextField(
                        value = ui.pin,
                        onValueChange = vm::setPin,
                        label = { Text(stringResource(R.string.complete_pin)) },
                        isError = pinError != null || ui.localError == CompleteUi.LocalError.PIN_OR_PHOTO,
                        supportingText = if (pinError != null) { { Text(pinError) } } else null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        textStyle = MaterialTheme.typography.headlineSmall.copy(textDirection = TextDirection.Ltr, textAlign = TextAlign.Center),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                Text(stringResource(if (d.pinRequired) R.string.complete_photo_hint_pin else R.string.complete_photo_hint), style = MaterialTheme.typography.bodySmall)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = {
                        val uri = newCaptureUri(context, "pod")
                        pendingUri = uri
                        camera.launch(uri)
                    }) {
                        Icon(Icons.Filled.CameraAlt, contentDescription = null)
                        Text(stringResource(if (ui.photoUri == null) R.string.complete_take_photo else R.string.complete_retake_photo), modifier = Modifier.padding(start = 6.dp))
                    }
                    when {
                        ui.photoUploading -> CircularProgressIndicator(Modifier.padding(start = 12.dp).size(24.dp))
                        ui.photoFileId != null -> Icon(Icons.Filled.CheckCircle, contentDescription = stringResource(R.string.complete_photo_uploaded), tint = QabnahColors.Success, modifier = Modifier.padding(start = 12.dp))
                    }
                }
                ui.photoUri?.let {
                    AsyncImage(model = it, contentDescription = stringResource(R.string.complete_photo_preview), contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().height(180.dp).clip(MaterialTheme.shapes.medium))
                }
                ui.photoError?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error) }
                ui.fieldErrors["photoFileId"]?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (ui.localError == CompleteUi.LocalError.PIN_OR_PHOTO) Text(stringResource(R.string.complete_pin_or_photo), color = MaterialTheme.colorScheme.error)

                val recipientError = ui.fieldErrors["recipientName"]
                OutlinedTextField(
                    value = ui.recipientName,
                    onValueChange = vm::setRecipient,
                    label = { Text(stringResource(R.string.complete_recipient)) },
                    isError = recipientError != null,
                    supportingText = if (recipientError != null) { { Text(recipientError) } } else null,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )

                if (ui.codDue > 0) {
                    val codError = ui.fieldErrors["codCollectedBaisa"]
                    OutlinedTextField(
                        value = ui.codText,
                        onValueChange = vm::setCod,
                        label = { Text(stringResource(R.string.complete_cod_collected)) },
                        suffix = { Text("OMR") },
                        isError = codError != null || ui.localError == CompleteUi.LocalError.BAD_COD_AMOUNT,
                        supportingText = { Text(codError ?: stringResource(R.string.complete_cod_due, money(ui.codDue))) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        textStyle = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                OutlinedTextField(
                    value = ui.note,
                    onValueChange = vm::setNote,
                    label = { Text(stringResource(R.string.complete_note)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                ui.error?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error) }
                ProgressButton(stringResource(R.string.complete_submit), onClick = vm::submit, enabled = !ui.photoUploading, loading = ui.submitting)
            }
        }
    }
}
