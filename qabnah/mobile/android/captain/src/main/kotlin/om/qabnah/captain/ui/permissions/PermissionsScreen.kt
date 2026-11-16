package om.qabnah.captain.ui.permissions

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.captain.ui.home.OnlineUi
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import om.qabnah.captain.data.OnlineController
import om.qabnah.android.ui.components.ProgressButton
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.util.Intents
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R

private fun granted(context: Context, permission: String) =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

/**
 * Rationale + request for the runtime permissions the captain app uses:
 * precise location (required to go online), notifications (offers; Android 13+), background location (optional).
 * FOREGROUND_SERVICE_LOCATION is an install-time permission declared in the manifest.
 */
@Composable
fun PermissionsScreen(container: CaptainContainer, onBack: () -> Unit) {
    val context = LocalContext.current
    var refreshTick by remember { mutableIntStateOf(0) }
    LifecycleResumeEffect(Unit) {
        refreshTick++ // re-read grants after returning from system settings
        onPauseOrDispose { }
    }
    val tick = refreshTick
    val fine = remember(tick) { granted(context, Manifest.permission.ACCESS_FINE_LOCATION) }
    val notifications = remember(tick) {
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || granted(context, Manifest.permission.POST_NOTIFICATIONS)
    }
    val background = remember(tick) {
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || granted(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    }
    var denied by remember { mutableStateOf(false) }
    val vm: GoOnlineViewModel = viewModel { GoOnlineViewModel(container.online) }
    val goState by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.done.collect { onBack() } }

    val locationLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
        denied = res[Manifest.permission.ACCESS_FINE_LOCATION] != true
        refreshTick++
    }
    val singleLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { refreshTick++ }

    ScreenScaffold(title = stringResource(R.string.permissions_title), onBack = onBack) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.permissions_intro), style = MaterialTheme.typography.bodyMedium)
            PermissionCard(
                icon = Icons.Filled.MyLocation,
                title = stringResource(R.string.permission_location_title),
                body = stringResource(R.string.permission_location_body),
                tag = stringResource(R.string.permission_required),
                granted = fine,
                onGrant = {
                    locationLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                },
            )
            if (denied && !fine) {
                Text(stringResource(R.string.permission_denied_settings), color = MaterialTheme.colorScheme.error)
                TextButton(onClick = { Intents.openAppSettings(context) }) { Text(stringResource(R.string.permission_open_settings)) }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                PermissionCard(
                    icon = Icons.Filled.Notifications,
                    title = stringResource(R.string.permission_notifications_title),
                    body = stringResource(R.string.permission_notifications_body),
                    tag = stringResource(R.string.permission_recommended),
                    granted = notifications,
                    onGrant = { singleLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) },
                )
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                PermissionCard(
                    icon = Icons.Filled.LocationOn,
                    title = stringResource(R.string.permission_background_title),
                    body = stringResource(R.string.permission_background_body),
                    tag = stringResource(R.string.permission_optional),
                    granted = background,
                    enabled = fine, // Android requires foreground location first
                    onGrant = { singleLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION) },
                )
            }
            goState.error?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error) }
            ProgressButton(
                text = stringResource(R.string.permissions_go_online),
                enabled = fine && container.captain.profile.value?.canGoOnline == true,
                loading = goState.busy,
                onClick = vm::goOnline,
            )
        }
    }
}

@Composable
private fun PermissionCard(
    icon: ImageVector,
    title: String,
    body: String,
    tag: String,
    granted: Boolean,
    onGrant: () -> Unit,
    enabled: Boolean = true,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null)
                Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f).padding(horizontal = 12.dp))
                Text(tag, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(body, style = MaterialTheme.typography.bodySmall)
            if (granted) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = QabnahColors.Success, modifier = Modifier.size(18.dp))
                    Text(stringResource(R.string.permission_granted), color = QabnahColors.Success, modifier = Modifier.padding(start = 6.dp))
                }
            } else {
                OutlinedButton(onClick = onGrant, enabled = enabled) { Text(stringResource(R.string.permission_allow)) }
            }
        }
    }
}

/** Goes online from the permissions screen once location is granted. */
class GoOnlineViewModel(private val online: OnlineController) : ViewModel() {
    private val _state = MutableStateFlow(OnlineUi())
    val state: StateFlow<OnlineUi> = _state.asStateFlow()
    private val _done = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val done: SharedFlow<Unit> = _done.asSharedFlow()

    fun goOnline() {
        if (_state.value.busy) return
        viewModelScope.launch {
            _state.value = OnlineUi(busy = true)
            try {
                online.goOnline()
                _state.value = OnlineUi()
                _done.emit(Unit)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.value = OnlineUi(error = e)
            }
        }
    }
}
