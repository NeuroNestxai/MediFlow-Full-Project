package om.qabnah.consumer.ui.account

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.locale.AppLocale
import om.qabnah.android.locale.isArabic
import om.qabnah.android.ui.components.ConfirmDialog
import om.qabnah.android.ui.components.InlineError
import om.qabnah.android.ui.components.digits
import om.qabnah.consumer.BuildConfig
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.android.R as CommonR

@Composable
fun AccountScreen(
    container: ConsumerContainer,
    onAddresses: () -> Unit,
    onNotifications: () -> Unit,
    onSupport: () -> Unit,
) {
    val vm: AccountViewModel = viewModel { AccountViewModel(container.account, container.cart, container.realtime) }
    val me by vm.me.collectAsStateWithLifecycle()
    val unread by vm.unread.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    var editingName by rememberSaveable { mutableStateOf(false) }
    var choosingLanguage by rememberSaveable { mutableStateOf(false) }
    var confirmSignOut by rememberSaveable { mutableStateOf(false) }
    LifecycleResumeEffect(Unit) {
        vm.load(refresh = me.data != null)
        onPauseOrDispose { }
    }

    Column(Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState())) {
        Text(stringResource(R.string.account_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(16.dp))
        me.error?.let { InlineError(it, onRetry = { vm.load() }) }
        error?.let { InlineError(it, onRetry = null, modifier = Modifier.clickable { vm.clearError() }) }
        val user = me.data?.user
        ListItem(
            headlineContent = { Text(user?.fullName?.ifBlank { null } ?: stringResource(R.string.account_no_name), style = MaterialTheme.typography.titleLarge) },
            supportingContent = { user?.phone?.let { Text(it, style = MaterialTheme.typography.bodyMedium.copy(textDirection = TextDirection.Ltr)) } },
            trailingContent = {
                IconButton(onClick = { editingName = true }, enabled = user != null) {
                    Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.account_edit_name))
                }
            },
        )
        HorizontalDivider()
        NavRow(Icons.Filled.Place, stringResource(R.string.account_addresses), onAddresses)
        ListItem(
            leadingContent = {
                BadgedBox(badge = { if (unread > 0) Badge { Text(digits(unread.toString())) } }) {
                    Icon(Icons.Filled.Notifications, contentDescription = null)
                }
            },
            headlineContent = { Text(stringResource(CommonR.string.notifications_title)) },
            modifier = Modifier.clickable(onClick = onNotifications),
        )
        NavRow(Icons.Filled.SupportAgent, stringResource(CommonR.string.support_title), onSupport)
        ListItem(
            leadingContent = { Icon(Icons.Filled.Language, contentDescription = null) },
            headlineContent = { Text(stringResource(CommonR.string.language)) },
            supportingContent = { Text(stringResource(if (isArabic()) CommonR.string.language_ar else CommonR.string.language_en)) },
            modifier = Modifier.clickable { choosingLanguage = true },
        )
        HorizontalDivider()
        ListItem(
            leadingContent = { Icon(Icons.Filled.PowerSettingsNew, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
            headlineContent = { Text(stringResource(CommonR.string.sign_out), color = MaterialTheme.colorScheme.error) },
            modifier = Modifier.clickable { confirmSignOut = true },
        )
        Text(
            stringResource(CommonR.string.common_version, BuildConfig.VERSION_NAME),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(16.dp),
        )
    }

    if (editingName) {
        var name by rememberSaveable { mutableStateOf(me.data?.user?.fullName.orEmpty()) }
        AlertDialog(
            onDismissRequest = { editingName = false },
            title = { Text(stringResource(R.string.account_edit_name)) },
            text = { OutlinedTextField(value = name, onValueChange = { name = it.take(80) }, singleLine = true, modifier = Modifier.fillMaxWidth()) },
            confirmButton = {
                TextButton(onClick = { vm.rename(name); editingName = false }, enabled = name.isNotBlank()) { Text(stringResource(CommonR.string.common_save)) }
            },
            dismissButton = { TextButton(onClick = { editingName = false }) { Text(stringResource(CommonR.string.common_cancel)) } },
        )
    }
    if (choosingLanguage) {
        val current = if (isArabic()) AppLocale.ARABIC else AppLocale.ENGLISH
        AlertDialog(
            onDismissRequest = { choosingLanguage = false },
            title = { Text(stringResource(CommonR.string.language)) },
            text = {
                Column {
                    listOf(AppLocale.ARABIC to CommonR.string.language_ar, AppLocale.ENGLISH to CommonR.string.language_en).forEach { (tag, label) ->
                        androidx.compose.foundation.layout.Row(
                            Modifier.fillMaxWidth().clickable { choosingLanguage = false; vm.setLanguage(tag) }.padding(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = current == tag, onClick = null)
                            Text(stringResource(label), modifier = Modifier.padding(start = 8.dp))
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { choosingLanguage = false }) { Text(stringResource(CommonR.string.common_close)) } },
        )
    }
    if (confirmSignOut) {
        ConfirmDialog(
            title = stringResource(CommonR.string.sign_out),
            text = stringResource(CommonR.string.sign_out_confirm),
            confirmLabel = stringResource(CommonR.string.sign_out),
            onConfirm = { confirmSignOut = false; vm.signOut() },
            onDismiss = { confirmSignOut = false },
        )
    }
}

@Composable
private fun NavRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, onClick: () -> Unit) {
    ListItem(
        leadingContent = { Icon(icon, contentDescription = null) },
        headlineContent = { Text(title) },
        modifier = Modifier.clickable(onClick = onClick),
    )
}
