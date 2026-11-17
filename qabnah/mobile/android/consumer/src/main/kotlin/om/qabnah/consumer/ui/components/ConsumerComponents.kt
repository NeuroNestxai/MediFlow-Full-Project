package om.qabnah.consumer.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.TwoWheeler
import androidx.compose.material.icons.outlined.Category
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.LocalCafe
import androidx.compose.material.icons.outlined.LocalFlorist
import androidx.compose.material.icons.outlined.LocalGroceryStore
import androidx.compose.material.icons.outlined.LocalPharmacy
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import om.qabnah.android.ui.components.QButton
import om.qabnah.android.ui.components.QNightBar
import om.qabnah.android.ui.components.QPrice
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.loc
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.components.tabular
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.consumer.R
import om.qabnah.core.cart.Cart
import om.qabnah.core.model.MerchantCategory

/** Outlined glyph for the branded photo placeholder of a store category. */
fun categoryGlyph(category: MerchantCategory): ImageVector = when (category) {
    MerchantCategory.RESTAURANT -> Icons.Outlined.Restaurant
    MerchantCategory.CAFE -> Icons.Outlined.LocalCafe
    MerchantCategory.GROCERY -> Icons.Outlined.LocalGroceryStore
    MerchantCategory.PHARMACY -> Icons.Outlined.LocalPharmacy
    MerchantCategory.RETAIL -> Icons.Outlined.Storefront
    MerchantCategory.FLOWERS -> Icons.Outlined.LocalFlorist
    MerchantCategory.ELECTRONICS -> Icons.Outlined.Devices
    MerchantCategory.OTHER, MerchantCategory.UNKNOWN -> Icons.Outlined.Category
}

/**
 * Floating cart bar: the screen's single night surface with the saffron CTA. Shows the item count, the store and the
 * subtotal; the whole bar opens the cart.
 */
@Composable
fun CartBar(cart: Cart, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val description = stringResource(R.string.cart_view, digits(cart.itemCount.toString()), money(cart.subtotalBaisa))
    QNightBar(modifier = modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = description }, onClick = onClick) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(QabnahColors.Night2), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.ShoppingBag, contentDescription = null, tint = QabnahColors.OnNight, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f).clearAndSetSemantics { }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    digits(cart.itemCount.toString()),
                    style = MaterialTheme.typography.labelMedium.tabular(),
                    color = QabnahColors.OnNightMuted,
                )
                Text(" × ", style = MaterialTheme.typography.labelMedium, color = QabnahColors.OnNightMuted)
                Text(
                    cart.merchant?.let { loc(it.nameEn, it.nameAr) }.orEmpty(),
                    style = MaterialTheme.typography.labelMedium,
                    color = QabnahColors.OnNightMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            QPrice(cart.subtotalBaisa, style = MaterialTheme.typography.titleMedium, color = QabnahColors.OnNight, currencyColor = QabnahColors.OnNightMuted)
        }
        Spacer(Modifier.width(8.dp))
        QButton(stringResource(R.string.cart_view_short), onClick = onClick, compact = true, saffron = true, modifier = Modifier.clearAndSetSemantics { })
    }
}

/** A numbered step heading (checkout, send wizard). */
@Composable
fun StepHeader(number: Int, title: String, modifier: Modifier = Modifier) {
    Row(modifier.padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(26.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
            Text(digits(number.toString()), style = MaterialTheme.typography.labelMedium.tabular(), color = MaterialTheme.colorScheme.onPrimary)
        }
        Spacer(Modifier.width(10.dp))
        Text(title, style = MaterialTheme.typography.titleMedium)
    }
}

/**
 * The assigned captain: glyph avatar (no photo is provided by the API), first name, real rating when present, vehicle
 * and plate, and a call button while the delivery is active.
 */
@Composable
fun CaptainCard(c: om.qabnah.core.model.CaptainPublic, modifier: Modifier = Modifier) {
    val context = androidx.compose.ui.platform.LocalContext.current
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(48.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.TwoWheeler, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(26.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(c.firstName, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (c.ratingAvg > 0) {
                    Spacer(Modifier.width(8.dp))
                    Icon(Icons.Filled.Star, contentDescription = stringResource(R.string.store_rating), tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(16.dp))
                    Text(digits(String.format(java.util.Locale.US, "%.1f", c.ratingAvg)), style = MaterialTheme.typography.labelMedium.tabular())
                }
            }
            val vehicle = listOfNotNull(
                om.qabnah.android.ui.components.vehicleLabel(c.vehicleType).takeIf { it.isNotBlank() },
                c.vehicleColor,
                c.vehicleModel,
            ).joinToString(" · ")
            if (vehicle.isNotBlank()) Text(vehicle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            c.vehiclePlate?.let {
                Text(stringResource(R.string.tracking_plate, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        c.phone?.let { phone ->
            om.qabnah.android.ui.components.QCircleIconButton(
                Icons.Filled.Call,
                contentDescription = stringResource(R.string.tracking_call_captain),
                onClick = { om.qabnah.android.util.Intents.dial(context, phone) },
                size = 44.dp,
            )
        }
    }
}
