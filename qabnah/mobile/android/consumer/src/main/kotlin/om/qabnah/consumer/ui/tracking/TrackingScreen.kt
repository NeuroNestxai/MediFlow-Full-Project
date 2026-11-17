package om.qabnah.consumer.ui.tracking

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.state.WhileStarted
import om.qabnah.android.ui.components.ErrorState
import om.qabnah.android.ui.components.QCircleIconButton
import om.qabnah.android.ui.components.QDockedSheet
import om.qabnah.android.ui.components.SkeletonBox
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.deliveryStatusLabel
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.orderStatusLabel
import om.qabnah.android.ui.map.MapMarker
import om.qabnah.android.ui.map.OsmMap
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.consumer.ui.components.CaptainCard

/**
 * Live tracking: full-screen map (saffron route with white casing, dashed leg to the next stop) with a docked bottom
 * sheet carrying the status, ETA and the captain.
 */
@Composable
fun TrackingScreen(container: ConsumerContainer, orderId: String, onBack: () -> Unit) {
    val vm: TrackingViewModel = viewModel { TrackingViewModel(container.orders, container.realtime, orderId) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val t = ui.tracking
    // Poll + socket only while this destination is visible.
    WhileStarted(vm) { vm.observeWhileVisible() }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        when {
            t == null && ui.error != null -> ErrorState(ui.error!!, onRetry = { vm.retry() }, modifier = Modifier.statusBarsPadding().padding(top = 56.dp))
            t == null -> SkeletonBox(Modifier.fillMaxSize(), androidx.compose.ui.graphics.RectangleShape)
            else -> {
                val markers = buildList {
                    t.pickup?.let { add(MapMarker("pickup", it, om.qabnah.android.R.drawable.ic_pin_pickup, stringResource(om.qabnah.android.R.string.map_pickup))) }
                    t.dropoff?.let {
                        add(MapMarker("dropoff", it, om.qabnah.android.R.drawable.ic_pin_dropoff, stringResource(om.qabnah.android.R.string.map_dropoff), anchorCenter = true))
                    }
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
                    dashedColor = 0xFF0B1F1C.toInt(),
                    fitKey = ui.fitKey,
                    contentDescription = stringResource(R.string.tracking_map_description),
                )
                QDockedSheet(Modifier.align(Alignment.BottomCenter)) {
                    Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 20.dp)) {
                        Text(
                            t.deliveryStatus?.let { deliveryStatusLabel(it) } ?: orderStatusLabel(t.orderStatus),
                            style = MaterialTheme.typography.headlineSmall,
                        )
                        if (!t.orderStatus.isTerminal) {
                            ui.etaMinutes()?.let { m ->
                                Text(
                                    stringResource(R.string.tracking_eta, digits(m.toString())),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 2.dp),
                                )
                            }
                        }
                        t.captain?.let {
                            HorizontalDivider(Modifier.padding(vertical = 14.dp))
                            CaptainCard(it)
                        }
                    }
                }
            }
        }
        // Floating controls over the map.
        Row(Modifier.fillMaxWidth().statusBarsPadding().height(56.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            QCircleIconButton(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(om.qabnah.android.R.string.common_back),
                onClick = onBack,
                size = 40.dp,
                containerColor = Color.White,
                contentColor = QabnahColors.Ink,
            )
            Spacer(Modifier.weight(1f))
            if (ui.live) StatusPill(stringResource(R.string.tracking_live), QabnahColors.Success, onPhoto = true)
        }
    }
}
