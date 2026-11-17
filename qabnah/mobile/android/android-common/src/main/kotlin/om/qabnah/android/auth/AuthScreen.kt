package om.qabnah.android.auth

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.R
import om.qabnah.android.ui.components.DevBanner
import om.qabnah.android.ui.components.ProgressButton
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.core.api.ApiException
import om.qabnah.core.api.QabnahApi

/** Phone + OTP sign-in shared by both apps. */
@Composable
fun AuthScreen(
    api: QabnahApi,
    appName: String,
    @DrawableRes logo: Int,
    modifier: Modifier = Modifier,
    /** Shown under the welcome line when sign-in interrupts something (checkout, Orders tab, a deep link). */
    reason: String? = null,
) {
    val vm: AuthViewModel = viewModel { AuthViewModel(api) }
    val state by vm.state.collectAsStateWithLifecycle()

    Column(modifier.fillMaxSize().statusBarsPadding().imePadding()) {
        state.devCode?.let { DevBanner(stringResource(R.string.auth_dev_code, it)) }
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(32.dp))
            Image(
                painter = painterResource(logo),
                contentDescription = appName,
                modifier = Modifier.size(88.dp).clip(RoundedCornerShape(20.dp)),
            )
            Text(stringResource(R.string.auth_welcome, appName), style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
            reason?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(8.dp))
            when (state.step) {
                AuthUiState.Step.PHONE -> PhoneStep(state, vm)
                AuthUiState.Step.CODE -> CodeStep(state, vm)
            }
            state.error?.let { e ->
                val msg = if (e is ApiException.Unauthorized || e is ApiException.Validation) stringResource(R.string.auth_wrong_code)
                else errorMessage(e)
                Text(msg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(16.dp))
            Text(stringResource(R.string.auth_terms), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun PhoneStep(state: AuthUiState, vm: AuthViewModel) {
    Text(stringResource(R.string.auth_phone_title), style = MaterialTheme.typography.titleMedium)
    Text(stringResource(R.string.auth_phone_hint), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    OutlinedTextField(
        value = state.phoneInput,
        onValueChange = vm::onPhoneChange,
        label = { Text(stringResource(R.string.auth_phone_label)) },
        prefix = { Text("+968 ") },
        singleLine = true,
        isError = state.phoneInvalid,
        supportingText = if (state.phoneInvalid) { { Text(stringResource(R.string.auth_phone_invalid)) } } else null,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { vm.requestCode() }),
        // Phone numbers read left-to-right even in Arabic.
        textStyle = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr),
        modifier = Modifier.fillMaxWidth(),
    )
    ProgressButton(stringResource(R.string.auth_send_code), onClick = vm::requestCode, loading = state.loading)
}

@Composable
private fun CodeStep(state: AuthUiState, vm: AuthViewModel) {
    Text(stringResource(R.string.auth_code_title), style = MaterialTheme.typography.titleMedium)
    Text(
        stringResource(R.string.auth_code_sent_to, "⁦" + state.phoneE164 + "⁩"),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    OutlinedTextField(
        value = state.code,
        onValueChange = vm::onCodeChange,
        label = { Text(stringResource(R.string.auth_code_label)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Next),
        textStyle = MaterialTheme.typography.headlineSmall.copy(textDirection = TextDirection.Ltr, textAlign = TextAlign.Center),
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = state.fullName,
        onValueChange = vm::onNameChange,
        label = { Text(stringResource(R.string.auth_full_name_label)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { vm.verify() }),
        modifier = Modifier.fillMaxWidth(),
    )
    ProgressButton(stringResource(R.string.auth_verify), onClick = vm::verify, enabled = state.canVerify, loading = state.loading)
    if (state.resendInSeconds > 0) {
        Text(digits(stringResource(R.string.auth_resend_in, state.resendInSeconds)), style = MaterialTheme.typography.bodySmall)
    } else {
        TextButton(onClick = vm::requestCode, enabled = !state.loading) { Text(stringResource(R.string.auth_resend)) }
    }
    TextButton(onClick = vm::changeNumber) { Text(stringResource(R.string.auth_change_number)) }
}
