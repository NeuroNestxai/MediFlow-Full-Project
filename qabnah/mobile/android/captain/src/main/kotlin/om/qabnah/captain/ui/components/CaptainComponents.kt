package om.qabnah.captain.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import om.qabnah.android.ui.components.tabular
import om.qabnah.android.ui.theme.QabnahColors

/** Saffron countdown ring: [progress] 1 → 0 as the offer runs out; [content] sits in the middle. */
@Composable
fun CountdownRing(progress: Float, modifier: Modifier = Modifier, size: Dp = 132.dp, stroke: Dp = 8.dp, content: @Composable BoxScope.() -> Unit) {
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val w = stroke.toPx()
            val inset = w / 2
            val arcSize = Size(this.size.width - w, this.size.height - w)
            drawArc(QabnahColors.NightLine, 0f, 360f, useCenter = false, topLeft = Offset(inset, inset), size = arcSize, style = Stroke(w))
            drawArc(
                QabnahColors.Saffron,
                startAngle = -90f,
                sweepAngle = 360f * progress.coerceIn(0f, 1f),
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arcSize,
                style = Stroke(w, cap = StrokeCap.Round),
            )
        }
        content()
    }
}

/**
 * Simple bar chart drawn with Canvas (no chart dependency). Bars are the green tint, the [highlightIndex] bar (the current
 * day / block) is saffron. [labels] has one entry per bar; blank entries leave the tick unlabeled. Bars follow the layout
 * direction (first bar on the right in Arabic).
 */
@Composable
fun EarningsBarChart(
    values: List<Long>,
    labels: List<String>,
    highlightIndex: Int,
    description: String,
    modifier: Modifier = Modifier,
    height: Dp = 140.dp,
) {
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val max = (values.maxOrNull() ?: 0L).coerceAtLeast(1L)
    val barColor = QabnahColors.PrimaryOnNight
    val track = QabnahColors.NightLine
    Column(modifier.semantics { contentDescription = description }) {
        Canvas(Modifier.fillMaxWidth().height(height)) {
            val n = values.size.coerceAtLeast(1)
            val slot = size.width / n
            val barWidth = (slot * 0.62f).coerceAtMost(28.dp.toPx())
            val radius = CornerRadius(4.dp.toPx().coerceAtMost(barWidth / 2))
            val baseline = size.height - 1.dp.toPx()
            // Guide lines at 0, 50% and 100% of the tallest bar.
            listOf(0f, 0.5f, 1f).forEach { f ->
                val y = baseline - (baseline - 4.dp.toPx()) * f
                drawLine(track, Offset(0f, y), Offset(size.width, y), strokeWidth = 1.dp.toPx())
            }
            values.forEachIndexed { i, v ->
                val slotIndex = if (rtl) n - 1 - i else i
                val h = ((baseline - 4.dp.toPx()) * (v.toFloat() / max)).coerceAtLeast(if (v > 0) 3.dp.toPx() else 0f)
                if (h > 0f) {
                    drawRoundRect(
                        color = if (i == highlightIndex) QabnahColors.Saffron else barColor,
                        topLeft = Offset(slot * slotIndex + (slot - barWidth) / 2, baseline - h),
                        size = Size(barWidth, h),
                        cornerRadius = radius,
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
            labels.forEach { label ->
                Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    Text(
                        label,
                        style = MaterialTheme.typography.labelSmall.tabular(),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Visible,
                    )
                }
            }
        }
    }
}

/**
 * Pickup → drop-off rows joined by a line: green pin for the pickup, saffron dot for the drop-off (the map's pins).
 * [pickupDetail] / [dropoffDetail] are muted second lines (distance, contact…).
 */
@Composable
fun RouteRows(
    pickupLabel: String,
    pickup: String,
    dropoffLabel: String,
    dropoff: String,
    modifier: Modifier = Modifier,
    pickupDetail: String? = null,
    dropoffDetail: String? = null,
) {
    Column(modifier) {
        RouteRow(om.qabnah.android.R.drawable.ic_pin_pickup, pickupLabel, pickup, pickupDetail, connector = true)
        RouteRow(om.qabnah.android.R.drawable.ic_pin_dropoff, dropoffLabel, dropoff, dropoffDetail, connector = false)
    }
}

@Composable
private fun RouteRow(pin: Int, label: String, value: String, detail: String?, connector: Boolean) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
        Column(Modifier.width(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(painterResource(pin), contentDescription = null, tint = Color.Unspecified, modifier = Modifier.size(24.dp))
            if (connector) Box(Modifier.width(2.dp).weight(1f).background(MaterialTheme.colorScheme.outlineVariant))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f).padding(bottom = if (connector) 14.dp else 0.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (detail != null) Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** A labelled figure (earnings strip, stats). */
@Composable
fun StatTile(label: String, modifier: Modifier = Modifier, value: @Composable () -> Unit) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(2.dp))
        value()
    }
}

/** Pulsing-free "live" dot (motion with restraint): a solid dot with a soft halo. */
@Composable
fun HaloDot(color: Color, modifier: Modifier = Modifier, size: Dp = 12.dp) {
    Box(modifier.size(size * 2), contentAlignment = Alignment.Center) {
        Box(Modifier.size(size * 2).clip(CircleShape).background(color.copy(alpha = 0.25f)))
        Box(Modifier.size(size).clip(CircleShape).background(color))
    }
}
