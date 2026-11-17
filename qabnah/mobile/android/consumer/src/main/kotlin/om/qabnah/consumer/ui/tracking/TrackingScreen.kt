package om.qabnah.consumer.ui.tracking

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Card
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.state.WhileStarted
import om.qabnah.android.ui.components.ErrorState
import om.qabnah.android.ui.components.LoadingState
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.deliveryStatusLabel
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.orderStatusLabel
import om.qabnah.android.ui.components.vehicleLabel
import om.qabnah.android.ui.map.MapMarker
import om.qabnah.android.ui.map.OsmMap
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.util.Intents
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.core.model.CaptainPublic

@Composable
fun TrackingScreen(container: ConsumerContainer, orderId: String, onBack: () -> Unit) {
    val vm: TrackingViewModel = viewModel { TrackingViewModel(container.orders, container.realtime, orderId) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val t = ui.tracking
    // Poll + socket only while this destination is visible.
    WhileStarted(vm) { vm.observeWhileVisible() }

    ScreenScaffold(
        title = stringResource(R.string.tracking_title),
        onBack = onBack,
        actions = { if (ui.live) StatusPill(stringResource(R.string.tracking_live), QabnahColors.Success, Modifier.padding(end = 12.dp)) },
    ) { padding ->
        when {
            t == null && ui.loading -> LoadingState(Modifier.padding(padding))
            t == null && ui.error != null -> ErrorState(ui.error!!, onRetry = { vm.retry() }, modifier = Modifier.padding(padding))
            t != null -> Box(Modifier.padding(padding).fillMaxSize()) {
                val markers = buildList {
                    t.pickup?.let { add(MapMarker("pickup", it, om.qabnah.android.R.drawable.ic_pin_pickup, stringResource(om.qabnah.android.R.string.map_pickup))) }
                    t.dropoff?.let { add(MapMarker("dropoff", it, om.qabnah.android.R.drawable.ic_pin_dropoff, stringResource(om.qabnah.android.R.string.map_dropoff))) }
                    ui.captainPosition?.let {
                        add(
                            MapMarker(
                                "captain", it, om.qabnah.android.R.drawable.ic_pin_captain, stringResource(om.qabnah.android.R.string.map_captain),
                                rotation = t.captain?.location?.heading?.toFloat(), anchorCenter = true,
                            ),
                        )
                    }
                }
                OsmMap(
                    modifier = Modifier.fillMaxSize(),
                    markers = markers,
                    path = t.path,
                    dashedPath = ui.remainingLeg,
                    dashedColor = QabnahColors.Accent.toArgb(),
                    fitKey = ui.fitKey,
                    contentDescription = stringResource(R.string.tracking_map_description),
                )
                Card(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(12.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            t.deliveryStatus?.let { deliveryStatusLabel(it) } ?: orderStatusLabel(t.orderStatus),
                            style = MaterialTheme.typography.titleMedium,
                        )
                        if (!t.orderStatus.isTerminal) {
                            ui.etaMinutes()?.let { m ->
                                Text(stringResource(R.string.tracking_eta, digits(m.toString())), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                        t.captain?.let { CaptainCard(it) }
                    }
                }
            }
        }
    }
}

@Composable
private fun CaptainCard(c: CaptainPublic) {
    val context = LocalContext.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Person, contentDescription = null, modifier = Modifier.size(40.dp), tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(c.firstName, style = MaterialTheme.typography.titleMedium)
                if (c.ratingAvg > 0) {
                    Spacer(Modifier.width(8.dp))
                    Icon(Icons.Filled.Star, contentDescription = stringResource(R.string.store_rating), tint = QabnahColors.Accent, modifier = Modifier.size(16.dp))
                    Text(digits(String.format(java.util.Locale.US, "%.1f", c.ratingAvg)), style = MaterialTheme.typography.labelLarge)
                }
            }
            val vehicle = listOfNotNull(
                vehicleLabel(c.vehicleType).takeIf { it.isNotBlank() },
                c.vehicleColor,
                c.vehicleModel,
            ).joinToString(" · ")
            if (vehicle.isNotBlank()) Text(vehicle, style = MaterialTheme.typography.bodySmall)
            c.vehiclePlate?.let { Text(stringResource(R.string.tracking_plate, it), style = MaterialTheme.typography.bodySmall) }
        }
        c.phone?.let { phone ->
            FilledTonalIconButton(onClick = { Intents.dial(context, phone) }) {
                Icon(Icons.Filled.Call, contentDescription = stringResource(R.string.tracking_call_captain))
            }
        }
    }
}
