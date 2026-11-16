package om.qabnah.android.ui.map

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import om.qabnah.android.R
import om.qabnah.android.location.LocationProvider
import om.qabnah.android.location.hasLocationPermission
import om.qabnah.android.ui.components.ProgressButton
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.core.model.LatLng
import om.qabnah.core.util.Geo

/**
 * Returns a function that asks for location permission if needed and then delivers the current location
 * (null when denied or unavailable).
 */
@Composable
fun rememberCurrentLocationRequester(onResult: (LatLng?) -> Unit): () -> Unit {
    val context = LocalContext.current
    val provider = remember { LocationProvider(context.applicationContext) }
    val scope = rememberCoroutineScope()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) scope.launch { onResult(provider.current(highAccuracy = true)) } else onResult(null)
    }
    return {
        if (hasLocationPermission(context)) {
            scope.launch { onResult(provider.current(highAccuracy = true)) }
        } else {
            launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }
}

/** Map with a fixed centre pin; the user pans the map under it. */
@Composable
fun PinPickerMap(
    initial: LatLng?,
    onCenterChanged: (LatLng) -> Unit,
    modifier: Modifier = Modifier,
) {
    var centerRequest by remember { mutableStateOf<LatLng?>(null) }
    val requestLocation = rememberCurrentLocationRequester { loc -> if (loc != null) centerRequest = loc }
    Box(modifier) {
        OsmMap(
            modifier = Modifier.fillMaxSize(),
            initialCenter = initial ?: Geo.MUSCAT,
            initialZoom = if (initial != null) 17.0 else 13.0,
            centerRequest = centerRequest,
            onCenterChanged = onCenterChanged,
            contentDescription = stringResource(R.string.map_move_to_adjust),
        )
        Icon(
            Icons.Filled.Place,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .align(Alignment.Center)
                .size(44.dp)
                .offset(y = (-22).dp),
        )
        Surface(
            shape = MaterialTheme.shapes.small,
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
            modifier = Modifier.align(Alignment.TopCenter).padding(8.dp),
        ) {
            Text(stringResource(R.string.map_move_to_adjust), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
        }
        SmallFloatingActionButton(
            onClick = requestLocation,
            modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp),
        ) {
            Icon(Icons.Filled.MyLocation, contentDescription = stringResource(R.string.map_my_location))
        }
    }
}

/** Full-screen pin picker dialog. */
@Composable
fun PinPickerDialog(
    title: String,
    initial: LatLng?,
    onDismiss: () -> Unit,
    onPicked: (LatLng) -> Unit,
) {
    var center by rememberSaveable(stateSaver = LatLngSaver) { mutableStateOf(initial ?: Geo.MUSCAT) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        ScreenScaffold(title = title, onBack = onDismiss) { padding ->
            Column(Modifier.fillMaxSize().padding(padding)) {
                PinPickerMap(initial = initial, onCenterChanged = { center = it }, modifier = Modifier.weight(1f).fillMaxWidth())
                ProgressButton(
                    text = stringResource(R.string.map_use_this_location),
                    onClick = { onPicked(center) },
                    modifier = Modifier.padding(16.dp),
                )
            }
        }
    }
}

val LatLngSaver = androidx.compose.runtime.saveable.Saver<LatLng, List<Double>>(
    save = { listOf(it.lat, it.lng) },
    restore = { LatLng(it[0], it[1]) },
)
