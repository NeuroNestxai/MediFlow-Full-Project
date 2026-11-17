package om.qabnah.android.account

import android.content.ContentResolver
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DeleteForever
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import om.qabnah.android.R
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.core.account.DataExport
import om.qabnah.core.api.QabnahApi
import om.qabnah.core.model.AccountDeletion

data class PrivacyUi(
    val exporting: Boolean = false,
    /** Fetched export waiting for the create-document picker. */
    val pendingExport: String? = null,
    /** The picker was launched for [pendingExport] (not relaunched after a configuration change). */
    val pickerLaunched: Boolean = false,
    val exportError: Throwable? = null,
    val deleting: Boolean = false,
    val deleteError: Throwable? = null,
)

sealed interface PrivacyEvent {
    data object Saved : PrivacyEvent
    data object WriteFailed : PrivacyEvent
    data object Deleted : PrivacyEvent
}

/**
 * `GET /me/export` → Storage Access Framework (ACTION_CREATE_DOCUMENT) and `POST /me/delete`.
 * [onAccountDeleted] runs right after the 204 (the session is already cleared by then): app-specific cleanup such as
 * forgetting the push token, stopping location tracking and clearing the cart. It must not suspend.
 */
class PrivacyViewModel(private val api: QabnahApi, private val onAccountDeleted: () -> Unit) : ViewModel() {
    private val _ui = MutableStateFlow(PrivacyUi())
    val ui: StateFlow<PrivacyUi> = _ui.asStateFlow()
    private val _events = MutableSharedFlow<PrivacyEvent>(extraBufferCapacity = 2)
    val events: SharedFlow<PrivacyEvent> = _events.asSharedFlow()

    fun export() {
        if (_ui.value.exporting) return
        viewModelScope.launch {
            _ui.update { it.copy(exporting = true, exportError = null) }
            try {
                val text = withContext(Dispatchers.Default) { DataExport.toPrettyJson(api.exportMyData()) }
                _ui.update { it.copy(exporting = false, pendingExport = text, pickerLaunched = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(exporting = false, exportError = e) }
            }
        }
    }

    fun onPickerLaunched() = _ui.update { it.copy(pickerLaunched = true) }

    /** The picker result: null when the user cancelled. */
    fun save(resolver: ContentResolver, uri: Uri?) {
        val text = _ui.value.pendingExport ?: return
        _ui.update { it.copy(pendingExport = null, pickerLaunched = false) }
        if (uri == null) return
        viewModelScope.launch {
            val ok = withContext(Dispatchers.IO) {
                runCatching { resolver.openOutputStream(uri)?.use { it.write(text.toByteArray(Charsets.UTF_8)) } != null }.getOrDefault(false)
            }
            _events.emit(if (ok) PrivacyEvent.Saved else PrivacyEvent.WriteFailed)
        }
    }

    fun dismissExportError() = _ui.update { it.copy(exportError = null) }

    fun delete(typed: String) {
        if (!AccountDeletion.isConfirmed(typed) || _ui.value.deleting) return
        viewModelScope.launch {
            _ui.update { it.copy(deleting = true, deleteError = null) }
            try {
                api.deleteAccount() // 204: every session revoked, local session cleared
                onAccountDeleted()
                _ui.update { it.copy(deleting = false) }
                _events.emit(PrivacyEvent.Deleted)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // 409: active orders/deliveries or an unsettled balance; the server message says which.
                _ui.update { it.copy(deleting = false, deleteError = e) }
            }
        }
    }

    fun clearDeleteError() = _ui.update { it.copy(deleteError = null) }
}

/** "Download my data" and "Delete account" rows for the Account (consumer) / Profile (captain) screens. */
@Composable
fun PrivacySection(api: QabnahApi, onAccountDeleted: () -> Unit) {
    val vm: PrivacyViewModel = viewModel { PrivacyViewModel(api, onAccountDeleted) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var confirmingDelete by rememberSaveable { mutableStateOf(false) }
    val savedText = stringResource(R.string.privacy_export_saved)
    val failedText = stringResource(R.string.privacy_export_write_failed)
    val deletedText = stringResource(R.string.privacy_deleted)

    val createDocument = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(DataExport.MIME_TYPE)) { uri ->
        vm.save(context.contentResolver, uri)
    }
    LaunchedEffect(ui.pendingExport != null, ui.pickerLaunched) {
        if (ui.pendingExport != null && !ui.pickerLaunched) {
            vm.onPickerLaunched()
            createDocument.launch(DataExport.fileName())
        }
    }
    LaunchedEffect(Unit) {
        vm.events.collect { e ->
            val text = when (e) {
                PrivacyEvent.Saved -> savedText
                PrivacyEvent.WriteFailed -> failedText
                PrivacyEvent.Deleted -> deletedText
            }
            Toast.makeText(context, text, Toast.LENGTH_LONG).show()
        }
    }

    Text(
        stringResource(R.string.privacy_title),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 4.dp),
    )
    ListItem(
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        leadingContent = { Icon(Icons.Outlined.Download, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
        headlineContent = { Text(stringResource(R.string.privacy_export)) },
        supportingContent = { Text(stringResource(R.string.privacy_export_desc)) },
        trailingContent = { if (ui.exporting) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) },
        modifier = Modifier.clickable(enabled = !ui.exporting) { vm.export() },
    )
    ListItem(
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        leadingContent = { Icon(Icons.Outlined.DeleteForever, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
        headlineContent = { Text(stringResource(R.string.privacy_delete), color = MaterialTheme.colorScheme.error) },
        supportingContent = { Text(stringResource(R.string.privacy_delete_desc)) },
        modifier = Modifier.clickable { vm.clearDeleteError(); confirmingDelete = true },
    )

    ui.exportError?.let { err ->
        AlertDialog(
            onDismissRequest = vm::dismissExportError,
            title = { Text(stringResource(R.string.privacy_export)) },
            text = { Text(errorMessage(err)) },
            confirmButton = { TextButton(onClick = vm::dismissExportError) { Text(stringResource(R.string.common_ok)) } },
        )
    }

    if (confirmingDelete) {
        var typed by rememberSaveable { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { if (!ui.deleting) confirmingDelete = false },
            title = { Text(stringResource(R.string.privacy_delete)) },
            text = {
                Column {
                    Text(stringResource(R.string.privacy_delete_body))
                    OutlinedTextField(
                        value = typed,
                        onValueChange = { typed = it.take(20) },
                        label = { Text(stringResource(R.string.privacy_delete_type, AccountDeletion.CONFIRM_WORD)) },
                        singleLine = true,
                        enabled = !ui.deleting,
                        textStyle = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr),
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    )
                    ui.deleteError?.let { err ->
                        Text(
                            errorMessage(err),
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { vm.delete(typed) },
                    enabled = AccountDeletion.isConfirmed(typed) && !ui.deleting,
                ) {
                    if (ui.deleting) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Text(stringResource(R.string.privacy_delete_confirm), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = false }, enabled = !ui.deleting) { Text(stringResource(R.string.common_cancel)) }
            },
        )
    }
}
