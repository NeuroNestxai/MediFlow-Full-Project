package om.qabnah.consumer.ui.account

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material.icons.outlined.SupportAgent
import androidx.compose.material3.ListItemDefaults
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import om.qabnah.android.ui.components.QCard
import om.qabnah.android.ui.components.QLargeTitle
import om.qabnah.android.ui.components.SkeletonBox
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
import om.qabnah.android.account.PrivacySection
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
    val vm: AccountViewModel = viewModel { AccountViewModel(container.account, container.cart, container.realtime, container.push) }
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
        QLargeTitle(stringResource(R.string.account_title))
        me.error?.let { InlineError(it, onRetry = { vm.load() }) }
        error?.let { InlineError(it, onRetry = null, modifier = Modifier.clickable { vm.clearError() }) }
        val user = me.data?.user
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // Profile
            QCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(52.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.Person, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(28.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        if (me.data == null && me.loading) {
                            SkeletonBox(Modifier.fillMaxWidth(0.6f).height(20.dp))
                        } else {
                            Text(user?.fullName?.ifBlank { null } ?: stringResource(R.string.account_no_name), style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        user?.phone?.let {
                            Text(it, style = MaterialTheme.typography.bodyMedium.copy(textDirection = TextDirection.Ltr), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    IconButton(onClick = { editingName = true }, enabled = user != null) {
                        Icon(Icons.Outlined.Edit, contentDescription = stringResource(R.string.account_edit_name))
                    }
                }
            }
            // Navigation rows
            QCard(Modifier.fillMaxWidth(), padding = PaddingValues(vertical = 4.dp)) {
                NavRow(Icons.Outlined.Place, stringResource(R.string.account_addresses), onAddresses)
                HorizontalDivider(Modifier.padding(horizontal = 16.dp))
                NavRow(
                    Icons.Outlined.Notifications,
                    stringResource(CommonR.string.notifications_title),
                    onNotifications,
                    badge = if (unread > 0) digits(unread.toString()) else null,
                )
                HorizontalDivider(Modifier.padding(horizontal = 16.dp))
                NavRow(Icons.Outlined.SupportAgent, stringResource(CommonR.string.support_title), onSupport)
                HorizontalDivider(Modifier.padding(horizontal = 16.dp))
                NavRow(
                    Icons.Outlined.Language,
                    stringResource(CommonR.string.language),
                    onClick = { choosingLanguage = true },
                    value = stringResource(if (isArabic()) CommonR.string.language_ar else CommonR.string.language_en),
                )
            }
            // Privacy (PDPL): export and deletion
            QCard(Modifier.fillMaxWidth(), padding = PaddingValues(vertical = 4.dp)) {
                PrivacySection(container.api, onAccountDeleted = container::onAccountDeleted)
            }
            QCard(Modifier.fillMaxWidth(), padding = PaddingValues(vertical = 4.dp)) {
                ListItem(
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    leadingContent = { Icon(Icons.Outlined.PowerSettingsNew, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                    headlineContent = { Text(stringResource(CommonR.string.sign_out), color = MaterialTheme.colorScheme.error) },
                    modifier = Modifier.clickable { confirmSignOut = true },
                )
            }
        }
        Text(
            stringResource(CommonR.string.common_version, digits(BuildConfig.VERSION_NAME)),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
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
private fun NavRow(icon: ImageVector, title: String, onClick: () -> Unit, value: String? = null, badge: String? = null) {
    ListItem(
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        leadingContent = { Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
        headlineContent = { Text(title, style = MaterialTheme.typography.bodyMedium) },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (value != null) Text(value, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (badge != null) {
                    Box(Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary).padding(horizontal = 8.dp, vertical = 2.dp)) {
                        Text(badge, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onPrimary)
                    }
                }
                Spacer(Modifier.width(4.dp))
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
            }
        },
        modifier = Modifier.clickable(onClick = onClick),
    )
}
