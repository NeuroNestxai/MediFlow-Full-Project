package om.qabnah.captain.ui.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.SupportAgent
import androidx.compose.material3.ListItemDefaults
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import om.qabnah.android.ui.components.QCard
import om.qabnah.android.ui.components.QLargeTitle
import om.qabnah.android.ui.components.tabular
import androidx.compose.material.icons.filled.Star
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import om.qabnah.android.locale.AppLocale
import om.qabnah.android.locale.isArabic
import om.qabnah.android.ui.components.ConfirmDialog
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.vehicleLabel
import om.qabnah.android.account.PrivacySection
import om.qabnah.android.push.PushManager
import om.qabnah.captain.BuildConfig
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.captain.data.OnlineController
import om.qabnah.captain.ui.onboarding.captainStatusColor
import om.qabnah.captain.ui.onboarding.captainStatusLabel
import om.qabnah.core.api.QabnahApi
import om.qabnah.core.model.CaptainProfile
import om.qabnah.core.realtime.RealtimeClient
import om.qabnah.android.R as CommonR

class ProfileViewModel(
    private val repo: CaptainRepository,
    private val online: OnlineController,
    private val api: QabnahApi,
    private val realtime: RealtimeClient,
    private val push: PushManager,
) : ViewModel() {
    val profile: StateFlow<CaptainProfile?> = repo.profile
    private val _signingOut = MutableStateFlow(false)
    val signingOut: StateFlow<Boolean> = _signingOut.asStateFlow()

    fun refresh() = viewModelScope.launch { runCatching { repo.refreshProfile() } }

    fun setLanguage(language: String) {
        viewModelScope.launch { runCatching { repo.updateLocale(language) } }
        AppLocale.set(language)
    }

    /** Goes offline first (stops dispatch to this device), then revokes the session. */
    fun signOut() {
        if (_signingOut.value) return
        viewModelScope.launch {
            _signingOut.value = true
            if (repo.profile.value?.isOnline == true) runCatching { online.goOffline() } else online.stopTracking()
            push.unregister() // POST /me/devices/unregister while the session is still valid
            realtime.disconnect()
            api.logout()
            repo.clear()
            _signingOut.value = false
        }
    }
}

@Composable
fun ProfileScreen(
    container: CaptainContainer,
    onDocuments: () -> Unit,
    onZones: () -> Unit,
    onAvailability: () -> Unit,
    onVehicle: () -> Unit,
    onPermissions: () -> Unit,
    onNotifications: () -> Unit,
    onSupport: () -> Unit,
) {
    val vm: ProfileViewModel = viewModel { ProfileViewModel(container.captain, container.online, container.api, container.realtime, container.push) }
    val profile by vm.profile.collectAsStateWithLifecycle()
    var choosingLanguage by rememberSaveable { mutableStateOf(false) }
    var confirmSignOut by rememberSaveable { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState())) {
        QLargeTitle(stringResource(R.string.profile_title))
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            profile?.let { p ->
                QCard(Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(p.fullName, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(p.phone, style = MaterialTheme.typography.bodyMedium.copy(textDirection = TextDirection.Ltr), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        StatusPill(captainStatusLabel(p.status), captainStatusColor(p.status))
                    }
                    HorizontalDivider(Modifier.padding(vertical = 12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // Real figures from the captain profile; the rating appears once the captain has been rated.
                        if (p.ratingAvg > 0) {
                            Icon(Icons.Filled.Star, contentDescription = stringResource(R.string.profile_rating), tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(18.dp))
                            Text(
                                digits(String.format(java.util.Locale.US, "%.1f", p.ratingAvg)),
                                style = MaterialTheme.typography.titleMedium.tabular(),
                                modifier = Modifier.padding(start = 4.dp, end = 16.dp),
                            )
                        }
                        Text(stringResource(R.string.profile_acceptance, digits((p.acceptanceRate * 100).toInt().toString())), style = MaterialTheme.typography.bodyMedium)
                    }
                    val vehicle = listOfNotNull(vehicleLabel(p.vehicleType).ifBlank { null }, p.vehicleMake, p.vehicleModel, p.vehicleColor, p.vehiclePlate).joinToString("  ·  ")
                    if (vehicle.isNotBlank()) {
                        Text(vehicle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
                    }
                }
            }
            QCard(Modifier.fillMaxWidth(), padding = PaddingValues(vertical = 4.dp)) {
                NavRow(Icons.Outlined.Description, stringResource(R.string.documents_title), onDocuments)
                NavRow(Icons.Outlined.Map, stringResource(R.string.zones_title), onZones)
                NavRow(Icons.Outlined.Schedule, stringResource(R.string.availability_title), onAvailability)
                NavRow(Icons.Outlined.DirectionsCar, stringResource(R.string.profile_vehicle_payout), onVehicle)
                NavRow(Icons.Outlined.Security, stringResource(R.string.permissions_title), onPermissions)
            }
            QCard(Modifier.fillMaxWidth(), padding = PaddingValues(vertical = 4.dp)) {
                NavRow(Icons.Outlined.Notifications, stringResource(CommonR.string.notifications_title), onNotifications)
                NavRow(Icons.Outlined.SupportAgent, stringResource(CommonR.string.support_title), onSupport)
                NavRow(
                    Icons.Outlined.Language,
                    stringResource(CommonR.string.language),
                    onClick = { choosingLanguage = true },
                    value = stringResource(if (isArabic()) CommonR.string.language_ar else CommonR.string.language_en),
                )
            }
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

    if (choosingLanguage) {
        val current = if (isArabic()) AppLocale.ARABIC else AppLocale.ENGLISH
        AlertDialog(
            onDismissRequest = { choosingLanguage = false },
            title = { Text(stringResource(CommonR.string.language)) },
            text = {
                Column {
                    listOf(AppLocale.ARABIC to CommonR.string.language_ar, AppLocale.ENGLISH to CommonR.string.language_en).forEach { (tag, label) ->
                        Row(
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
            text = stringResource(R.string.profile_sign_out_body),
            confirmLabel = stringResource(CommonR.string.sign_out),
            onConfirm = { confirmSignOut = false; vm.signOut() },
            onDismiss = { confirmSignOut = false },
        )
    }
}

@Composable
private fun NavRow(icon: ImageVector, title: String, onClick: () -> Unit, value: String? = null) {
    ListItem(
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        leadingContent = { Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
        headlineContent = { Text(title, style = MaterialTheme.typography.bodyMedium) },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (value != null) Text(value, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
            }
        },
        modifier = Modifier.clickable(onClick = onClick),
    )
}
