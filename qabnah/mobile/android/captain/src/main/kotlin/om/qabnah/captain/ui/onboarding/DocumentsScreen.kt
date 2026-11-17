package om.qabnah.captain.ui.onboarding

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import android.net.Uri
import androidx.compose.foundation.clickable
import om.qabnah.android.ui.components.InlineError
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.util.UploadReader
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.core.model.CaptainDocType
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material.icons.outlined.VerifiedUser
import om.qabnah.android.ui.components.QBottomSheet
import om.qabnah.android.ui.components.QButton
import om.qabnah.android.ui.components.QCard
import om.qabnah.android.ui.components.QPhoto
import om.qabnah.android.ui.components.QSecondaryButton
import om.qabnah.android.ui.components.QTextButton
import om.qabnah.android.ui.components.digits
import om.qabnah.core.model.CaptainProfile

@Composable
fun DocumentsScreen(container: CaptainContainer, onBack: () -> Unit) {
    val context = LocalContext.current
    val vm: DocumentsViewModel = viewModel {
        val app = context.applicationContext
        DocumentsViewModel(container.captain) { uri -> UploadReader.read(app, uri) }
    }
    val profile by vm.profile.collectAsStateWithLifecycle()
    val ui by vm.ui.collectAsStateWithLifecycle()
    var choosingFor by remember { mutableStateOf<CaptainDocType?>(null) }
    var cameraUri by rememberSaveable { mutableStateOf<Uri?>(null) }
    var cameraType by rememberSaveable { mutableStateOf<CaptainDocType?>(null) }

    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = cameraUri
        val type = cameraType
        if (ok && uri != null && type != null) vm.picked(type, uri)
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val type = cameraType
        if (uri != null && type != null) vm.picked(type, uri)
    }

    ScreenScaffold(title = stringResource(R.string.documents_title), onBack = onBack) { padding ->
        LoadableContent(state = profile, onRefresh = { vm.load(refresh = true) }, modifier = Modifier.padding(padding)) { p ->
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    Text(stringResource(R.string.documents_intro), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp))
                    ui.error?.let { InlineError(it) }
                }
                items(documentTypes(p)) { type ->
                    DocumentRow(p, type, uploading = ui.uploading == type, enabled = ui.uploading == null) { choosingFor = type }
                }
            }
        }
    }

    choosingFor?.let { type ->
        QBottomSheet(onDismiss = { choosingFor = null }) {
            Text(docTypeLabel(type), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(16.dp))
            ListItem(
                colors = androidx.compose.material3.ListItemDefaults.colors(containerColor = androidx.compose.ui.graphics.Color.Transparent),
                leadingContent = { Icon(Icons.Outlined.CameraAlt, contentDescription = null) },
                headlineContent = { Text(stringResource(R.string.documents_take_photo)) },
                modifier = Modifier.clickable {
                    val uri = newCaptureUri(context, "doc")
                    cameraUri = uri
                    cameraType = type
                    choosingFor = null
                    camera.launch(uri)
                },
            )
            ListItem(
                colors = androidx.compose.material3.ListItemDefaults.colors(containerColor = androidx.compose.ui.graphics.Color.Transparent),
                leadingContent = { Icon(Icons.Outlined.PhotoLibrary, contentDescription = null) },
                headlineContent = { Text(stringResource(R.string.documents_choose_file)) },
                modifier = Modifier.clickable {
                    cameraType = type
                    choosingFor = null
                    picker.launch(arrayOf("image/*", "application/pdf"))
                },
            )
            androidx.compose.foundation.layout.Spacer(Modifier.padding(16.dp))
        }
    }

    ui.pending?.let { pending -> DocumentDetailsDialog(pending.type, onConfirm = vm::upload, onDismiss = vm::cancelPending) }
}

/** Required documents first, then any other uploaded types. */
private fun documentTypes(p: CaptainProfile): List<CaptainDocType> =
    (p.requiredDocuments + p.documents.map { it.docType }).filter { it != CaptainDocType.UNKNOWN }.distinct()

/**
 * Document card: glyph tile, name, status pill (missing / pending / approved / rejected), rejection reason and expiry,
 * with one upload / replace action.
 */
@Composable
private fun DocumentRow(p: CaptainProfile, type: CaptainDocType, uploading: Boolean, enabled: Boolean, onUpload: () -> Unit) {
    val doc = p.latestDocument(type)
    val missing = type in p.missingDocuments || doc == null
    val status = doc?.status
    val (statusText, tint) = when {
        missing -> stringResource(R.string.doc_status_missing) to QabnahColors.Warning
        status == "approved" -> stringResource(R.string.doc_status_approved) to QabnahColors.Success
        status == "rejected" -> stringResource(R.string.doc_status_rejected) to QabnahColors.Danger
        else -> stringResource(R.string.doc_status_pending) to QabnahColors.Info
    }
    QCard(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            QPhoto(
                url = null,
                contentDescription = null,
                glyph = docGlyph(type),
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.size(width = 64.dp, height = 48.dp),
            )
            Column(Modifier.weight(1f).padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(docTypeLabel(type), style = MaterialTheme.typography.titleSmall)
                StatusPill(statusText, tint)
            }
            if (uploading) CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
        }
        doc?.rejectionReason?.takeIf { status == "rejected" }?.let {
            Text(stringResource(R.string.doc_rejection_reason, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
        }
        doc?.expiresAt?.let {
            Text(stringResource(R.string.doc_expires, digits(it)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        }
        if (!uploading && (missing || status == "rejected" || status == "approved")) {
            val label = stringResource(if (missing) R.string.documents_upload else R.string.documents_replace)
            if (missing || status == "rejected") {
                QButton(label, onClick = onUpload, enabled = enabled, icon = Icons.Outlined.UploadFile, compact = true, modifier = Modifier.fillMaxWidth().padding(top = 12.dp))
            } else {
                QSecondaryButton(label, onClick = onUpload, enabled = enabled, icon = Icons.Outlined.UploadFile, compact = true, modifier = Modifier.fillMaxWidth().padding(top = 12.dp))
            }
        }
    }
}

private fun docGlyph(type: CaptainDocType): androidx.compose.ui.graphics.vector.ImageVector = when (type) {
    CaptainDocType.NATIONAL_ID -> Icons.Outlined.Badge
    CaptainDocType.DRIVING_LICENSE -> Icons.Outlined.CreditCard
    CaptainDocType.VEHICLE_REGISTRATION -> Icons.Outlined.DirectionsCar
    CaptainDocType.VEHICLE_INSURANCE -> Icons.Outlined.Shield
    CaptainDocType.PROFILE_PHOTO -> Icons.Outlined.Person
    CaptainDocType.POLICE_CLEARANCE -> Icons.Outlined.VerifiedUser
    else -> Icons.Outlined.Description
}

@Composable
private fun DocumentDetailsDialog(type: CaptainDocType, onConfirm: (String?, String?) -> Unit, onDismiss: () -> Unit) {
    var number by rememberSaveable { mutableStateOf("") }
    var expires by rememberSaveable { mutableStateOf("") }
    val expiresValid = expires.isBlank() || Regex("""\d{4}-\d{2}-\d{2}""").matches(expires)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(docTypeLabel(type)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(number, { number = it.take(40) }, label = { Text(stringResource(R.string.documents_number)) }, singleLine = true)
                OutlinedTextField(
                    expires,
                    { expires = it.take(10) },
                    label = { Text(stringResource(R.string.documents_expiry)) },
                    placeholder = { Text(stringResource(R.string.documents_expiry_format)) },
                    isError = !expiresValid,
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            QTextButton(stringResource(R.string.documents_upload), onClick = { onConfirm(number.trim(), expires.trim()) }, enabled = expiresValid)
        },
        dismissButton = { QTextButton(stringResource(om.qabnah.android.R.string.common_cancel), onClick = onDismiss) },
    )
}
