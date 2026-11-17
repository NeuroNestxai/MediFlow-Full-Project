package om.qabnah.android.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import om.qabnah.android.R
import om.qabnah.android.locale.isArabic
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.core.model.DeliveryStatus
import om.qabnah.core.model.OrderStatus
import om.qabnah.core.model.PaymentMethod
import om.qabnah.core.model.TicketCategory
import om.qabnah.core.model.VehicleType
import om.qabnah.core.money.Money
import om.qabnah.core.money.Units
import om.qabnah.core.util.localized
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

@Composable
@ReadOnlyComposable
fun money(baisa: Long): String = Money.format(baisa, isArabic())

@Composable
@ReadOnlyComposable
fun distance(meters: Int): String = Units.distance(meters, isArabic())

@Composable
@ReadOnlyComposable
fun durationMinutes(seconds: Int): String = Units.minutes(seconds, isArabic())

@Composable
@ReadOnlyComposable
fun digits(text: String): String = Units.localizeDigits(text, isArabic())

@Composable
@ReadOnlyComposable
fun loc(en: String?, ar: String?): String = localized(en, ar, isArabic())

private val MUSCAT: ZoneId = ZoneId.of("Asia/Muscat")

/** Medium date + short time in Muscat time, e.g. "16 Nov 2026, 14:05". */
@Composable
fun dateTime(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val instant = runCatching { Instant.parse(iso) }.getOrNull() ?: return iso
    val locale = if (isArabic()) Locale.forLanguageTag("ar-OM") else Locale.ENGLISH
    // Dates use the same digits as every other number on screen (java.time keeps Latin digits for "ar-OM").
    return Units.localizeDigits(
        DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)
            .withLocale(locale)
            .withZone(MUSCAT)
            .format(instant),
        isArabic(),
    )
}

/** Time only, e.g. "14:05". */
@Composable
fun timeOnly(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val instant = runCatching { Instant.parse(iso) }.getOrNull() ?: return iso
    val locale = if (isArabic()) Locale.forLanguageTag("ar-OM") else Locale.ENGLISH
    return Units.localizeDigits(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).withZone(MUSCAT).format(instant), isArabic())
}

@Composable
fun orderStatusLabel(status: OrderStatus): String = stringResource(
    when (status) {
        OrderStatus.PENDING_PAYMENT -> R.string.order_status_pending_payment
        OrderStatus.PLACED -> R.string.order_status_placed
        OrderStatus.ACCEPTED -> R.string.order_status_accepted
        OrderStatus.PREPARING -> R.string.order_status_preparing
        OrderStatus.READY_FOR_PICKUP -> R.string.order_status_ready_for_pickup
        OrderStatus.OUT_FOR_DELIVERY -> R.string.order_status_out_for_delivery
        OrderStatus.DELIVERED -> R.string.order_status_delivered
        OrderStatus.COMPLETED -> R.string.order_status_completed
        OrderStatus.REJECTED -> R.string.order_status_rejected
        OrderStatus.CANCELLED -> R.string.order_status_cancelled
        OrderStatus.UNKNOWN -> R.string.status_unknown
    },
)

/** For timeline entries, which carry the status as a plain string. */
@Composable
fun orderStatusLabel(wire: String): String {
    val s = OrderStatus.entries.firstOrNull { it.wire == wire }
    return if (s != null && s != OrderStatus.UNKNOWN) orderStatusLabel(s) else wire.replace('_', ' ')
}

fun orderStatusColor(status: OrderStatus): Color = when (status) {
    OrderStatus.DELIVERED, OrderStatus.COMPLETED -> QabnahColors.Success
    OrderStatus.REJECTED, OrderStatus.CANCELLED -> QabnahColors.Danger
    OrderStatus.PENDING_PAYMENT -> QabnahColors.Accent
    else -> QabnahColors.Primary
}

@Composable
fun deliveryStatusLabel(status: DeliveryStatus): String = stringResource(
    when (status) {
        DeliveryStatus.CREATED -> R.string.delivery_status_created
        DeliveryStatus.SEARCHING -> R.string.delivery_status_searching
        DeliveryStatus.UNASSIGNED -> R.string.delivery_status_unassigned
        DeliveryStatus.ASSIGNED -> R.string.delivery_status_assigned
        DeliveryStatus.AT_PICKUP -> R.string.delivery_status_at_pickup
        DeliveryStatus.PICKED_UP -> R.string.delivery_status_picked_up
        DeliveryStatus.AT_DROPOFF -> R.string.delivery_status_at_dropoff
        DeliveryStatus.DELIVERED -> R.string.delivery_status_delivered
        DeliveryStatus.FAILED -> R.string.delivery_status_failed
        DeliveryStatus.RETURNING -> R.string.delivery_status_returning
        DeliveryStatus.RETURNED -> R.string.delivery_status_returned
        DeliveryStatus.CANCELLED -> R.string.delivery_status_cancelled
        DeliveryStatus.UNKNOWN -> R.string.status_unknown
    },
)

@Composable
fun vehicleLabel(type: VehicleType): String = when (type) {
    VehicleType.BIKE -> stringResource(R.string.vehicle_bike)
    VehicleType.CAR -> stringResource(R.string.vehicle_car)
    VehicleType.VAN -> stringResource(R.string.vehicle_van)
    VehicleType.UNKNOWN -> ""
}

@Composable
fun vehicleLabel(wire: String?): String =
    vehicleLabel(VehicleType.entries.firstOrNull { it.wire == wire } ?: VehicleType.UNKNOWN)

@Composable
fun paymentMethodLabel(method: PaymentMethod): String = when (method) {
    PaymentMethod.ONLINE -> stringResource(R.string.payment_online)
    PaymentMethod.COD -> stringResource(R.string.payment_cod)
    PaymentMethod.PREPAID -> stringResource(R.string.payment_prepaid)
    PaymentMethod.UNKNOWN -> ""
}

@Composable
fun ticketCategoryLabel(category: TicketCategory): String = stringResource(
    when (category) {
        TicketCategory.ORDER_ISSUE -> R.string.ticket_category_order_issue
        TicketCategory.PAYMENT -> R.string.ticket_category_payment
        TicketCategory.DELIVERY -> R.string.ticket_category_delivery
        TicketCategory.CAPTAIN -> R.string.ticket_category_captain
        TicketCategory.MERCHANT -> R.string.ticket_category_merchant
        TicketCategory.ACCOUNT -> R.string.ticket_category_account
        TicketCategory.OTHER, TicketCategory.UNKNOWN -> R.string.ticket_category_other
    },
)
