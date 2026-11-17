package om.qabnah.android.ui.map

import android.content.Context
import android.graphics.DashPathEffect
import android.graphics.Paint
import androidx.annotation.DrawableRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import om.qabnah.core.model.LatLng
import om.qabnah.core.util.Geo
import org.osmdroid.config.Configuration
import org.osmdroid.events.DelayedMapListener
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.CopyrightOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline
import java.io.File

/**
 * osmdroid setup: identifies the app to the OSM tile servers (required by their usage policy) and keeps the tile
 * cache in app-private storage, so no storage permission is needed.
 * NOTE: tile.openstreetmap.org is fine for development; production traffic needs a commercial/self-hosted tile source.
 */
object OsmConfig {
    @Volatile private var initialized = false

    fun ensure(context: Context) {
        if (initialized) return
        synchronized(this) {
            if (initialized) return
            val app = context.applicationContext
            Configuration.getInstance().apply {
                load(app, app.getSharedPreferences("osmdroid", Context.MODE_PRIVATE))
                userAgentValue = app.packageName
                osmdroidBasePath = File(app.cacheDir, "osmdroid")
                osmdroidTileCache = File(osmdroidBasePath, "tiles")
            }
            initialized = true
        }
    }
}

data class MapMarker(
    val key: String,
    val position: LatLng,
    @DrawableRes val icon: Int,
    val title: String? = null,
    /** Degrees clockwise (e.g. captain heading). */
    val rotation: Float? = null,
    val anchorCenter: Boolean = false,
)

fun LatLng.toGeoPoint() = GeoPoint(lat, lng)

/**
 * OpenStreetMap view for Compose.
 * - [path]: solid polyline (e.g. `Tracking.path` breadcrumbs); [dashedPath]: dashed polyline (captain → next stop).
 * - [fitKey]: whenever it changes the camera fits all [markers] and both paths.
 * - [centerRequest]: whenever it changes the camera animates there.
 * - [onCenterChanged]: reports the map centre after the user pans/zooms (pin pickers).
 */
@Composable
fun OsmMap(
    modifier: Modifier = Modifier,
    markers: List<MapMarker> = emptyList(),
    path: List<LatLng> = emptyList(),
    pathColor: Int = 0xFF0E7C66.toInt(),
    dashedPath: List<LatLng> = emptyList(),
    dashedColor: Int = pathColor,
    initialCenter: LatLng = markers.firstOrNull()?.position ?: Geo.MUSCAT,
    initialZoom: Double = 14.0,
    fitKey: Any? = null,
    centerRequest: LatLng? = null,
    onCenterChanged: ((LatLng) -> Unit)? = null,
    contentDescription: String? = null,
) {
    val context = LocalContext.current
    val mapView = remember {
        OsmConfig.ensure(context)
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            isTilesScaledToDpi = true
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
            minZoomLevel = 5.0
            maxZoomLevel = 19.0
            controller.setZoom(initialZoom)
            controller.setCenter(initialCenter.toGeoPoint())
            overlays.add(CopyrightOverlay(context))
        }
    }

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) mapView.onResume()
        onDispose {
            lifecycle.removeObserver(observer)
            mapView.onPause()
            mapView.onDetach()
        }
    }

    val centerCallback by rememberUpdatedState(onCenterChanged)
    DisposableEffect(mapView) {
        val listener = DelayedMapListener(
            object : MapListener {
                override fun onScroll(event: ScrollEvent?): Boolean {
                    centerCallback?.invoke(LatLng(mapView.mapCenter.latitude, mapView.mapCenter.longitude))
                    return false
                }

                override fun onZoom(event: ZoomEvent?): Boolean {
                    centerCallback?.invoke(LatLng(mapView.mapCenter.latitude, mapView.mapCenter.longitude))
                    return false
                }
            },
            150,
        )
        mapView.addMapListener(listener)
        onDispose { mapView.removeMapListener(listener) }
    }

    LaunchedEffect(fitKey) {
        if (fitKey == null) return@LaunchedEffect
        val points = (markers.map { it.position } + path + dashedPath).distinct().map { it.toGeoPoint() }
        mapView.post {
            when {
                points.size >= 2 -> runCatching {
                    mapView.zoomToBoundingBox(BoundingBox.fromGeoPoints(points).increaseByScale(1.4f), true, 64)
                }
                points.size == 1 -> mapView.controller.animateTo(points.first())
            }
        }
    }

    LaunchedEffect(centerRequest) {
        centerRequest?.let { mapView.controller.animateTo(it.toGeoPoint()) }
    }

    AndroidView(
        factory = { mapView },
        modifier = modifier.semantics { if (contentDescription != null) this.contentDescription = contentDescription },
        update = { view ->
            view.overlays.removeAll { it is Marker || it is Polyline }
            if (path.size >= 2) {
                val line = Polyline(view).apply {
                    setPoints(path.map { it.toGeoPoint() })
                    outlinePaint.color = pathColor
                    outlinePaint.strokeWidth = 8f
                }
                view.overlays.add(line)
            }
            if (dashedPath.size >= 2) {
                val dashed = Polyline(view).apply {
                    setPoints(dashedPath.map { it.toGeoPoint() })
                    outlinePaint.color = dashedColor
                    outlinePaint.strokeWidth = 6f
                    outlinePaint.strokeCap = Paint.Cap.ROUND
                    outlinePaint.pathEffect = DashPathEffect(floatArrayOf(24f, 18f), 0f)
                }
                view.overlays.add(dashed)
            }
            markers.forEach { m ->
                val marker = Marker(view).apply {
                    position = m.position.toGeoPoint()
                    icon = ContextCompat.getDrawable(view.context, m.icon)
                    title = m.title
                    if (m.anchorCenter) setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    else setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                    m.rotation?.let { rotation = -it } // osmdroid rotates counter-clockwise
                    setInfoWindow(null)
                }
                view.overlays.add(marker)
            }
            view.invalidate()
        },
    )
}
