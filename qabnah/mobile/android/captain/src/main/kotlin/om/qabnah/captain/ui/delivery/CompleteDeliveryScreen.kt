package om.qabnah.captain.ui.delivery

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import om.qabnah.android.locale.isArabic
import om.qabnah.android.ui.components.ErrorState
import om.qabnah.android.ui.components.LoadingState
import om.qabnah.android.ui.components.QBottomActionBar
import om.qabnah.android.ui.components.QButton
import om.qabnah.android.ui.components.QCard
import om.qabnah.android.ui.components.QPrice
import om.qabnah.android.ui.components.QSecondaryButton
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.components.tabular
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.util.UploadReader
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.captain.ui.onboarding.newCaptureUri
import om.qabnah.core.money.Money

private const val PIN_LENGTH = 4

/**
 * Proof of delivery: four large PIN boxes, cash collected (COD), an optional photo, recipient and note, with one saffron
 * "Mark as delivered" action in a sticky bar.
 */
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

    ScreenScaffold(
        title = stringResource(R.string.complete_title),
        onBack = onBack,
        bottomBar = {
            if (ui.delivery != null) {
                QBottomActionBar {
                    ui.error?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 8.dp)) }
                    QButton(
                        onClick = vm::submit,
                        enabled = !ui.photoUploading,
                        loading = ui.submitting,
                        saffron = true,
                        modifier = Modifier.fillMaxWidth().height(64.dp),
                    ) { Text(stringResource(R.string.complete_submit), style = MaterialTheme.typography.titleLarge) }
                }
            }
        },
    ) { padding ->
        val d = ui.delivery
        when {
            d == null && ui.loadError != null -> ErrorState(ui.loadError!!, onRetry = vm::load, modifier = Modifier.padding(padding))
            d == null -> LoadingState(Modifier.padding(padding))
            else -> Column(
                Modifier.padding(padding).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (d.pinRequired) {
                    QCard(Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.complete_pin), style = MaterialTheme.typography.titleMedium)
                        Text(stringResource(R.string.complete_pin_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        val pinError = ui.fieldErrors["pin"]
                        val isError = pinError != null || ui.localError == CompleteUi.LocalError.PIN_OR_PHOTO
                        PinBoxes(
                            value = ui.pin.take(PIN_LENGTH),
                            onChange = { vm.setPin(it.take(PIN_LENGTH)) },
                            isError = isError,
                            description = stringResource(R.string.complete_pin),
                            modifier = Modifier.padding(top = 14.dp, bottom = 4.dp),
                        )
                        if (pinError != null) Text(pinError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }

                if (ui.codDue > 0) {
                    QCard(Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Payments, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(10.dp))
                            Text(stringResource(R.string.complete_cod_collected), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                            QPrice(ui.codDue, style = MaterialTheme.typography.titleLarge)
                        }
                        val codError = ui.fieldErrors["codCollectedBaisa"]
                        OutlinedTextField(
                            value = ui.codText,
                            onValueChange = vm::setCod,
                            label = { Text(stringResource(R.string.complete_cod_collected)) },
                            suffix = { Text(if (isArabic()) Money.AR_CURRENCY else "OMR") },
                            isError = codError != null || ui.localError == CompleteUi.LocalError.BAD_COD_AMOUNT,
                            supportingText = { Text(codError ?: stringResource(R.string.complete_cod_due, money(ui.codDue))) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            textStyle = MaterialTheme.typography.titleLarge.tabular().copy(textDirection = TextDirection.Ltr),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                        )
                    }
                }

                QCard(Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.complete_photo_preview), style = MaterialTheme.typography.titleMedium)
                    Text(
                        stringResource(if (d.pinRequired) R.string.complete_photo_hint_pin else R.string.complete_photo_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    ui.photoUri?.let {
                        AsyncImage(
                            model = it,
                            contentDescription = stringResource(R.string.complete_photo_preview),
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxWidth().padding(top = 12.dp).aspectRatio(16f / 10f).clip(MaterialTheme.shapes.medium),
                        )
                    }
                    Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        QSecondaryButton(
                            stringResource(if (ui.photoUri == null) R.string.complete_take_photo else R.string.complete_retake_photo),
                            onClick = {
                                val uri = newCaptureUri(context, "pod")
                                pendingUri = uri
                                camera.launch(uri)
                            },
                            icon = Icons.Outlined.CameraAlt,
                            modifier = Modifier.weight(1f),
                        )
                        when {
                            ui.photoUploading -> CircularProgressIndicator(Modifier.padding(start = 12.dp).size(24.dp), strokeWidth = 2.dp)
                            ui.photoFileId != null -> Icon(
                                Icons.Filled.CheckCircle,
                                contentDescription = stringResource(R.string.complete_photo_uploaded),
                                tint = QabnahColors.PrimaryOnNight,
                                modifier = Modifier.padding(start = 12.dp),
                            )
                        }
                    }
                    ui.photoError?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
                    ui.fieldErrors["photoFileId"]?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
                }
                if (ui.localError == CompleteUi.LocalError.PIN_OR_PHOTO) {
                    Text(stringResource(R.string.complete_pin_or_photo), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                }

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
                OutlinedTextField(
                    value = ui.note,
                    onValueChange = vm::setNote,
                    label = { Text(stringResource(R.string.complete_note)) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/** Four large PIN boxes backed by one numeric text field; always left-to-right. The active box has a saffron border. */
@Composable
private fun PinBoxes(value: String, onChange: (String) -> Unit, isError: Boolean, description: String, modifier: Modifier = Modifier) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            textStyle = TextStyle(color = androidx.compose.ui.graphics.Color.Transparent),
            cursorBrush = SolidColor(androidx.compose.ui.graphics.Color.Transparent),
            modifier = modifier.fillMaxWidth().semantics { contentDescription = description },
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.Center) {
                    // The real field stays in the tree (invisible) so the keyboard and accessibility keep working.
                    Box(Modifier.size(1.dp)) { inner() }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally), modifier = Modifier.fillMaxWidth()) {
                        repeat(PIN_LENGTH) { i ->
                            val ch = value.getOrNull(i)
                            val active = i == value.length
                            val shape = MaterialTheme.shapes.small
                            val border = when {
                                isError -> MaterialTheme.colorScheme.error
                                active -> QabnahColors.Saffron
                                else -> MaterialTheme.colorScheme.outline
                            }
                            Box(
                                Modifier
                                    .size(width = 64.dp, height = 76.dp)
                                    .clip(shape)
                                    .background(QabnahColors.Night)
                                    .border(if (active || isError) 2.dp else 1.dp, border, shape),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (ch != null) Text(ch.toString(), style = MaterialTheme.typography.displaySmall.tabular(), color = MaterialTheme.colorScheme.onSurface)
                            }
                        }
                    }
                }
            },
        )
    }
}
