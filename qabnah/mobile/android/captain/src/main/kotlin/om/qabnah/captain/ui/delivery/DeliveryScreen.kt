package om.qabnah.captain.ui.delivery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.Navigation
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.SupportAgent
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.state.WhileStarted
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.QBottomActionBar
import om.qabnah.android.ui.components.QButton
import om.qabnah.android.ui.components.QCard
import om.qabnah.android.ui.components.QPrice
import om.qabnah.android.ui.components.QStepProgress
import om.qabnah.android.ui.components.QTextButton
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.deliveryStatusLabel
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.map.MapMarker
import om.qabnah.android.ui.map.OsmMap
import om.qabnah.android.ui.theme.QabnahButtonShape
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.util.Intents
import om.qabnah.android.util.NavApp
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.captain.ui.components.StatTile
import om.qabnah.core.model.CaptainDelivery
import om.qabnah.core.model.DeliveryAction
import om.qabnah.core.model.DeliveryStatus
import om.qabnah.core.model.Place
import om.qabnah.core.util.MapRoute

/**
 * Active delivery: map with the route, step progress, the next stop with large navigate / call / WhatsApp buttons, and
 * exactly one primary (saffron) action in a sticky bar. Fail / release are text actions below it.
 */
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
    val onAction: (DeliveryAction) -> Unit = { a -> if (a == DeliveryAction.COMPLETE) onComplete() else vm.onAction(a) }

    ScreenScaffold(
        title = state.data?.let { digits("#" + it.orderNumber) } ?: stringResource(R.string.delivery_title),
        onBack = onBack,
        actions = {
            state.data?.let { d ->
                IconButton(onClick = { onHelp(d.orderId) }) { Icon(Icons.Outlined.SupportAgent, contentDescription = stringResource(R.string.delivery_help)) }
            }
        },
        bottomBar = { state.data?.let { d -> ActionBar(d, actions, onAction) } },
    ) { padding ->
        LoadableContent(state = state, onRefresh = { vm.load(refresh = true) }, modifier = Modifier.padding(padding)) { d ->
            DeliveryBody(d, map)
        }
    }

    actions.askingReasonFor?.let { action ->
        ReasonDialog(action, onDismiss = vm::dismissReason, onConfirm = { reason -> vm.dismissReason(); vm.perform(action, reason) })
    }
}

/** 0-based index of the current step (to pickup · at pickup · to drop-off · at drop-off), or null when not in progress. */
private fun stepIndex(status: DeliveryStatus): Int? = when (status) {
    DeliveryStatus.ASSIGNED -> 0
    DeliveryStatus.AT_PICKUP -> 1
    DeliveryStatus.PICKED_UP -> 2
    DeliveryStatus.AT_DROPOFF -> 3
    DeliveryStatus.DELIVERED -> 4
    else -> null
}

@Composable
private fun DeliveryBody(d: CaptainDelivery, map: DeliveryMapUi) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        val markers = buildList {
            d.pickup.location?.let { add(MapMarker("pickup", it, om.qabnah.android.R.drawable.ic_pin_pickup, stringResource(om.qabnah.android.R.string.map_pickup))) }
            d.dropoff.location?.let {
                add(MapMarker("dropoff", it, om.qabnah.android.R.drawable.ic_pin_dropoff, stringResource(om.qabnah.android.R.string.map_dropoff), anchorCenter = true))
            }
            map.captain?.let {
                add(MapMarker("captain", it, om.qabnah.android.R.drawable.ic_pin_captain, stringResource(om.qabnah.android.R.string.map_captain), anchorCenter = true))
            }
        }
        val nextStop = MapRoute.nextStop(d.status, d.pickup.location, d.dropoff.location)
        Box(Modifier.fillMaxWidth().height(240.dp)) {
            OsmMap(
                modifier = Modifier.fillMaxSize(),
                markers = markers,
                path = map.path,
                dashedPath = MapRoute.remainingLeg(map.captain, nextStop),
                dashedColor = 0xFFF3F7F5.toInt(),
                // Re-fit when the job moves to the next stop or the first location fix arrives.
                fitKey = "${d.id}:${d.status}:${map.captain != null}",
                contentDescription = stringResource(R.string.delivery_map_description),
            )
        }
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // Status + progress
            Column {
                Text(deliveryStatusLabel(d.status), style = MaterialTheme.typography.headlineSmall)
                stepIndex(d.status)?.let { QStepProgress(steps = 4, current = it, modifier = Modifier.padding(top = 10.dp)) }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatTile(stringResource(R.string.offer_you_earn), Modifier.weight(1f)) {
                    QPrice(d.earningBaisa, style = MaterialTheme.typography.titleLarge)
                }
                Column(horizontalAlignment = Alignment.End) {
                    d.merchantName?.let { Text(it, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    if (d.itemsCount > 0) {
                        Text(stringResource(R.string.delivery_items, digits(d.itemsCount.toString())), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (d.codAmountBaisa > 0) {
                QCard(Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Payments, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            stringResource(R.string.delivery_collect_cash, money(d.codAmountBaisa)),
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(start = 12.dp),
                        )
                    }
                }
            }
            d.packageDescription?.let { Text(stringResource(R.string.delivery_package, it), style = MaterialTheme.typography.bodyMedium) }

            // The stop the captain is heading to comes first, with the large contact buttons.
            if (d.headingToPickup) {
                PlaceCard(stringResource(R.string.delivery_pickup), om.qabnah.android.R.drawable.ic_pin_pickup, d.pickup, current = true)
                PlaceCard(stringResource(R.string.delivery_dropoff), om.qabnah.android.R.drawable.ic_pin_dropoff, d.dropoff, current = false)
            } else {
                PlaceCard(stringResource(R.string.delivery_dropoff), om.qabnah.android.R.drawable.ic_pin_dropoff, d.dropoff, current = true)
                PlaceCard(stringResource(R.string.delivery_pickup), om.qabnah.android.R.drawable.ic_pin_pickup, d.pickup, current = false)
            }
        }
    }
}

/** Sticky bar: the one primary action (64 dp, saffron); destructive actions are text buttons under it. */
@Composable
private fun ActionBar(d: CaptainDelivery, actions: DeliveryActionsUi, onAction: (DeliveryAction) -> Unit) {
    val available = d.nextActions.filter { it != DeliveryAction.UNKNOWN }
    val primary = available.firstOrNull { it != DeliveryAction.FAIL && it != DeliveryAction.RELEASE }
    val secondary = available.filter { it == DeliveryAction.FAIL || it == DeliveryAction.RELEASE }
    val enabled = actions.busy == null
    QBottomActionBar {
        actions.error?.let {
            Text(errorMessage(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 8.dp))
        }
        if (primary != null) {
            QButton(
                onClick = { onAction(primary) },
                enabled = enabled,
                loading = actions.busy == primary,
                saffron = true,
                modifier = Modifier.fillMaxWidth().height(64.dp),
            ) { Text(stringResource(actionLabel(primary)), style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
        if (secondary.isNotEmpty()) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
                secondary.forEach { a ->
                    QTextButton(stringResource(actionLabel(a)), onClick = { onAction(a) }, enabled = enabled, danger = true)
                }
            }
        }
        if (available.isEmpty()) {
            Text(stringResource(R.string.delivery_no_actions), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
private fun PlaceCard(title: String, pin: Int, place: Place, current: Boolean) {
    val context = LocalContext.current
    var navMenu by remember { mutableStateOf(false) }
    QCard(Modifier.fillMaxWidth(), containerColor = if (current) MaterialTheme.colorScheme.surface else QabnahColors.Night) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(androidx.compose.ui.res.painterResource(pin), contentDescription = null, tint = androidx.compose.ui.graphics.Color.Unspecified, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(8.dp))
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        place.address?.let { Text(it, style = if (current) MaterialTheme.typography.titleLarge else MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 6.dp)) }
        place.contactName?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        place.notes?.let { Text(stringResource(R.string.delivery_notes, it), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp)) }

        val phone = place.contactPhone?.takeIf { it.any(Char::isDigit) && !it.contains('*') }
        val location = place.location
        if (location != null || phone != null) {
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (location != null) {
                    Box(Modifier.weight(1f)) {
                        BigAction(Icons.Outlined.Navigation, stringResource(R.string.delivery_navigate), onClick = { navMenu = true })
                        DropdownMenu(expanded = navMenu, onDismissRequest = { navMenu = false }) {
                            DropdownMenuItem(text = { Text(stringResource(R.string.nav_google_maps)) }, onClick = { navMenu = false; Intents.navigate(context, location, NavApp.GOOGLE_MAPS) })
                            DropdownMenuItem(text = { Text(stringResource(R.string.nav_waze)) }, onClick = { navMenu = false; Intents.navigate(context, location, NavApp.WAZE) })
                            DropdownMenuItem(text = { Text(stringResource(R.string.nav_other)) }, onClick = { navMenu = false; Intents.navigate(context, location, NavApp.OTHER, place.address) })
                        }
                    }
                }
                if (phone != null) {
                    Box(Modifier.weight(1f)) {
                        BigAction(Icons.Outlined.Call, stringResource(om.qabnah.android.R.string.common_call), onClick = { Intents.dial(context, phone) })
                    }
                    Box(Modifier.weight(1f)) {
                        BigAction(Icons.AutoMirrored.Outlined.Chat, stringResource(om.qabnah.android.R.string.common_whatsapp), onClick = { Intents.whatsapp(context, phone) })
                    }
                }
            }
        }
    }
}

/** Large contact/navigation button: icon over label, 64 dp tall, easy to hit with gloves or on a bike mount. */
@Composable
private fun BigAction(icon: ImageVector, label: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = QabnahButtonShape,
        color = QabnahColors.NightLine,
        contentColor = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp),
    ) {
        Column(Modifier.padding(vertical = 10.dp, horizontal = 6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(24.dp))
            Spacer(Modifier.height(4.dp))
            Text(label, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
        confirmButton = { QTextButton(stringResource(om.qabnah.android.R.string.common_confirm), onClick = { onConfirm(reason.trim()) }, enabled = reason.isNotBlank()) },
        dismissButton = { QTextButton(stringResource(om.qabnah.android.R.string.common_cancel), onClick = onDismiss) },
    )
}

