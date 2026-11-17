package om.qabnah.captain.ui.delivery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.state.WhileStarted
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.deliveryStatusLabel
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.map.MapMarker
import om.qabnah.android.ui.map.OsmMap
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.util.Intents
import om.qabnah.android.util.NavApp
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.core.model.CaptainDelivery
import om.qabnah.core.model.DeliveryAction
import om.qabnah.core.model.Place
import om.qabnah.core.util.MapRoute

@Composable
fun DeliveryScreen(
    container: CaptainContainer,
    deliveryId: String,
    onBack: () -> Unit,
    onComplete: () -> Unit,
    onHelp: (String) -> Unit,
) {
    val vm: DeliveryViewModel = viewModel {
        DeliveryViewModel(container.captain, container.realtime, container.services.location, container.locationReporter, deliveryId)
    }
    val state by vm.state.collectAsStateWithLifecycle()
    val actions by vm.actions.collectAsStateWithLifecycle()
    val map by vm.map.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.released.collect { onBack() } }
    // Socket + polling + location only while this screen is visible.
    WhileStarted(vm) { vm.observeWhileVisible() }

    ScreenScaffold(
        title = state.data?.let { digits("#" + it.orderNumber) } ?: stringResource(R.string.delivery_title),
        onBack = onBack,
        actions = {
            state.data?.let { d ->
                IconButton(onClick = { onHelp(d.orderId) }) { Icon(Icons.Filled.SupportAgent, contentDescription = stringResource(R.string.delivery_help)) }
            }
        },
    ) { padding ->
        LoadableContent(state = state, onRefresh = { vm.load(refresh = true) }, modifier = Modifier.padding(padding)) { d ->
            DeliveryBody(d, map, actions, onAction = { a -> if (a == DeliveryAction.COMPLETE) onComplete() else vm.onAction(a) })
        }
    }

    actions.askingReasonFor?.let { action ->
        ReasonDialog(action, onDismiss = vm::dismissReason, onConfirm = { reason -> vm.dismissReason(); vm.perform(action, reason) })
    }
}

@Composable
private fun DeliveryBody(d: CaptainDelivery, map: DeliveryMapUi, actions: DeliveryActionsUi, onAction: (DeliveryAction) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        val markers = buildList {
            d.pickup.location?.let { add(MapMarker("pickup", it, om.qabnah.android.R.drawable.ic_pin_pickup, stringResource(om.qabnah.android.R.string.map_pickup))) }
            d.dropoff.location?.let { add(MapMarker("dropoff", it, om.qabnah.android.R.drawable.ic_pin_dropoff, stringResource(om.qabnah.android.R.string.map_dropoff))) }
            map.captain?.let {
                add(MapMarker("captain", it, om.qabnah.android.R.drawable.ic_pin_captain, stringResource(om.qabnah.android.R.string.map_captain), anchorCenter = true))
            }
        }
        val nextStop = MapRoute.nextStop(d.status, d.pickup.location, d.dropoff.location)
        Box(Modifier.fillMaxWidth().height(220.dp)) {
            OsmMap(
                modifier = Modifier.fillMaxSize(),
                markers = markers,
                path = map.path,
                dashedPath = MapRoute.remainingLeg(map.captain, nextStop),
                dashedColor = QabnahColors.Accent.toArgb(),
                // Re-fit when the job moves to the next stop or the first location fix arrives.
                fitKey = "${d.id}:${d.status}:${map.captain != null}",
                contentDescription = stringResource(R.string.delivery_map_description),
            )
        }
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    d.merchantName?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
                    if (d.itemsCount > 0) Text(stringResource(R.string.delivery_items, digits(d.itemsCount.toString())), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.delivery_earning, money(d.earningBaisa)), style = MaterialTheme.typography.labelLarge)
                }
                StatusPill(deliveryStatusLabel(d.status), QabnahColors.Primary)
            }
            if (d.codAmountBaisa > 0) {
                Card(colors = CardDefaults.cardColors(containerColor = QabnahColors.Danger.copy(alpha = 0.1f)), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Payments, contentDescription = null, tint = QabnahColors.Danger)
                        Text(
                            stringResource(R.string.delivery_collect_cash, money(d.codAmountBaisa)),
                            style = MaterialTheme.typography.titleMedium,
                            color = QabnahColors.Danger,
                            modifier = Modifier.padding(start = 12.dp),
                        )
                    }
                }
            }
            d.packageDescription?.let { Text(stringResource(R.string.delivery_package, it), style = MaterialTheme.typography.bodyMedium) }

            PlaceCard(stringResource(R.string.delivery_pickup), d.pickup, highlight = d.headingToPickup)
            PlaceCard(stringResource(R.string.delivery_dropoff), d.dropoff, highlight = !d.headingToPickup)

            actions.error?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error) }
            d.nextActions.filter { it != DeliveryAction.UNKNOWN }.forEach { a ->
                val label = stringResource(actionLabel(a))
                val loading = actions.busy == a
                val enabled = actions.busy == null
                if (a == DeliveryAction.FAIL || a == DeliveryAction.RELEASE) {
                    OutlinedButton(onClick = { onAction(a) }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
                        Text(label, color = MaterialTheme.colorScheme.error)
                    }
                } else {
                    Button(onClick = { onAction(a) }, enabled = enabled, modifier = Modifier.fillMaxWidth().height(56.dp)) {
                        if (loading) CircularProgressIndicator(strokeWidth = 2.dp) else Text(label, style = MaterialTheme.typography.titleMedium)
                    }
                }
            }
            if (d.nextActions.isEmpty()) {
                Text(stringResource(R.string.delivery_no_actions), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

fun actionLabel(a: DeliveryAction): Int = when (a) {
    DeliveryAction.ARRIVE_PICKUP -> R.string.action_arrive_pickup
    DeliveryAction.PICKUP -> R.string.action_pickup
    DeliveryAction.ARRIVE_DROPOFF -> R.string.action_arrive_dropoff
    DeliveryAction.COMPLETE -> R.string.action_complete
    DeliveryAction.FAIL -> R.string.action_fail
    DeliveryAction.RELEASE -> R.string.action_release
    DeliveryAction.UNKNOWN -> R.string.action_unknown
}

@Composable
private fun PlaceCard(title: String, place: Place, highlight: Boolean) {
    val context = LocalContext.current
    var navMenu by remember { mutableStateOf(false) }
    Card(
        colors = if (highlight) CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer) else CardDefaults.cardColors(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge)
            place.address?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
            place.contactName?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            place.notes?.let { Text(stringResource(R.string.delivery_notes, it), style = MaterialTheme.typography.bodySmall) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                place.location?.let { loc ->
                    Box {
                        FilledTonalButton(onClick = { navMenu = true }) {
                            Icon(Icons.Filled.Navigation, contentDescription = null)
                            Text(stringResource(R.string.delivery_navigate), modifier = Modifier.padding(start = 4.dp))
                        }
                        DropdownMenu(expanded = navMenu, onDismissRequest = { navMenu = false }) {
                            DropdownMenuItem(text = { Text(stringResource(R.string.nav_google_maps)) }, onClick = { navMenu = false; Intents.navigate(context, loc, NavApp.GOOGLE_MAPS) })
                            DropdownMenuItem(text = { Text(stringResource(R.string.nav_waze)) }, onClick = { navMenu = false; Intents.navigate(context, loc, NavApp.WAZE) })
                            DropdownMenuItem(text = { Text(stringResource(R.string.nav_other)) }, onClick = { navMenu = false; Intents.navigate(context, loc, NavApp.OTHER, place.address) })
                        }
                    }
                }
                place.contactPhone?.takeIf { it.any(Char::isDigit) && !it.contains('*') }?.let { phone ->
                    IconButton(onClick = { Intents.dial(context, phone) }) {
                        Icon(Icons.Filled.Call, contentDescription = stringResource(om.qabnah.android.R.string.common_call))
                    }
                    IconButton(onClick = { Intents.whatsapp(context, phone) }) {
                        Icon(Icons.Filled.Forum, contentDescription = stringResource(om.qabnah.android.R.string.common_whatsapp))
                    }
                }
            }
        }
    }
}

@Composable
private fun ReasonDialog(action: DeliveryAction, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var reason by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(actionLabel(action))) },
        text = {
            Column {
                Text(stringResource(if (action == DeliveryAction.RELEASE) R.string.reason_release_hint else R.string.reason_fail_hint))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it.take(300) },
                    label = { Text(stringResource(R.string.reason_label)) },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(reason.trim()) }, enabled = reason.isNotBlank()) { Text(stringResource(om.qabnah.android.R.string.common_confirm)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(om.qabnah.android.R.string.common_cancel)) } },
    )
}

