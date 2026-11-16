package om.qabnah.android.auth

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import kotlinx.coroutines.launch
import om.qabnah.android.R
import om.qabnah.core.api.QabnahApi
import om.qabnah.core.model.ProfileUpdate

/**
 * After sign-in, asks for a name once if the account has none (new user who skipped the optional name field),
 * then `PATCH /me`. Network errors are silent: the prompt simply appears again next launch.
 */
@Composable
fun CompleteProfileGate(api: QabnahApi, onUpdated: () -> Unit = {}) {
    var needsName by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var showError by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        needsName = runCatching { api.me().user.fullName.isBlank() }.getOrDefault(false)
    }
    if (!needsName) return
    AlertDialog(
        onDismissRequest = {},
        title = { Text(stringResource(R.string.auth_name_title)) },
        text = {
            Column {
                Text(stringResource(R.string.auth_name_hint))
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(80); showError = false },
                    singleLine = true,
                    isError = showError,
                    supportingText = if (showError) { { Text(stringResource(R.string.auth_name_required)) } } else null,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving,
                onClick = {
                    if (name.isBlank()) {
                        showError = true
                        return@TextButton
                    }
                    saving = true
                    scope.launch {
                        val ok = runCatching { api.updateMe(ProfileUpdate(fullName = name.trim())) }.isSuccess
                        saving = false
                        if (ok) {
                            needsName = false
                            onUpdated()
                        } else {
                            showError = true
                        }
                    }
                },
            ) { Text(stringResource(R.string.common_save)) }
        },
    )
}
