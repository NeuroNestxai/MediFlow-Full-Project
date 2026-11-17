package om.qabnah.core.push

/**
 * An FCM/APNs push as described in the contract: `title`, `body` and a data map
 * `{type, orderId?, deliveryId?, offerId?, ticketId?, number?}`. `type` matches the in-app notification types
 * (order.accepted, delivery.picked_up, offer.created, support.reply, …).
 */
data class PushPayload(
    val title: String? = null,
    val body: String? = null,
    val type: String? = null,
    val orderId: String? = null,
    val deliveryId: String? = null,
    val offerId: String? = null,
    val ticketId: String? = null,
    /** Human-readable order number (e.g. `Q-10234`). */
    val number: String? = null,
) {
    companion object {
        /**
         * Builds a payload from the FCM data map (or from the launch-intent extras the system adds when the user taps a
         * notification that FCM displayed itself while the app was in the background). Blank values count as absent.
         */
        fun from(data: Map<String, String?>, title: String? = null, body: String? = null): PushPayload {
            fun v(key: String) = data[key]?.trim()?.takeIf { it.isNotEmpty() }
            return PushPayload(
                title = title?.takeIf { it.isNotBlank() } ?: v("title"),
                body = body?.takeIf { it.isNotBlank() } ?: v("body"),
                type = v("type"),
                orderId = v("orderId")?.takeIf(DeepLinks::isValidId),
                deliveryId = v("deliveryId")?.takeIf(DeepLinks::isValidId),
                offerId = v("offerId")?.takeIf(DeepLinks::isValidId),
                ticketId = v("ticketId")?.takeIf(DeepLinks::isValidId),
                number = v("number"),
            )
        }
    }

    /** True when the map looked like a Qabnah push at all (used to ignore unrelated launch extras). */
    val isQabnahPush: Boolean get() = type != null || orderId != null || deliveryId != null || offerId != null || ticketId != null
}

/** Android notification channels used for pushes. `offers` is high-importance and exists in the captain app only. */
enum class PushChannel(val id: String) { ORDERS("orders"), OFFERS("offers"), SUPPORT("support") }

object PushTypes {
    const val OFFER_CREATED = "offer.created"
    const val SUPPORT_REPLY = "support.reply"
    const val DELIVERY_ASSIGNED = "delivery.assigned"
    const val DELIVERY_PICKED_UP = "delivery.picked_up"
}

/** Pure push → channel / deep link mapping shared by both apps (unit-tested in :core). */
object PushRouting {

    fun channel(p: PushPayload, app: ClientApp): PushChannel = when {
        p.type == PushTypes.SUPPORT_REPLY || p.type?.startsWith("support.") == true -> PushChannel.SUPPORT
        p.type == PushTypes.OFFER_CREATED && app == ClientApp.CAPTAIN -> PushChannel.OFFERS
        else -> PushChannel.ORDERS
    }

    /** Where tapping the notification leads; null opens the app's start screen. */
    fun deepLink(p: PushPayload, app: ClientApp): DeepLink? = when (app) {
        ClientApp.CONSUMER -> when {
            p.type == PushTypes.SUPPORT_REPLY && p.ticketId != null -> DeepLink.Ticket(p.ticketId)
            p.orderId != null -> DeepLink.Order(
                p.orderId,
                openTracking = p.type == PushTypes.DELIVERY_ASSIGNED || p.type == PushTypes.DELIVERY_PICKED_UP,
            )
            p.ticketId != null -> DeepLink.Ticket(p.ticketId)
            else -> null
        }
        ClientApp.CAPTAIN -> when {
            p.type == PushTypes.OFFER_CREATED && p.offerId != null -> DeepLink.Offer(p.offerId)
            p.type == PushTypes.SUPPORT_REPLY && p.ticketId != null -> DeepLink.Ticket(p.ticketId)
            p.deliveryId != null -> DeepLink.Delivery(p.deliveryId)
            p.offerId != null -> DeepLink.Offer(p.offerId)
            p.ticketId != null -> DeepLink.Ticket(p.ticketId)
            else -> null
        }
    }

    /**
     * Stable notification id per entity, so a newer update for the same order replaces the previous notification.
     * Kept above 100 000 so it never collides with the apps' own ids (online service, offer alerts).
     */
    fun notificationId(p: PushPayload): Int {
        val key = p.orderId?.let { "order:$it" }
            ?: p.deliveryId?.let { "delivery:$it" }
            ?: p.offerId?.let { "offer:$it" }
            ?: p.ticketId?.let { "ticket:$it" }
            ?: "type:${p.type.orEmpty()}"
        return 100_000 + (key.hashCode() and 0x00FF_FFFF)
    }
}
