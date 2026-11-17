package om.qabnah.core.push

/** Which Qabnah app is handling a deep link or push (also the `app` value of `POST /me/devices`). */
enum class ClientApp(val wire: String) { CONSUMER("consumer"), CAPTAIN("captain") }

/**
 * In-app destinations reachable from outside the app (contract `info.description`):
 * `qabnah://order/<orderId>`, `qabnah://offer/<offerId>`, `qabnah://delivery/<deliveryId>`, `qabnah://ticket/<ticketId>`,
 * plus the checkout `returnUrl` `qabnah://payment-return?orderId=…`.
 */
sealed interface DeepLink {
    /** [openTracking]: open the live map on top of the order (client-side hint, `?track=1`). */
    data class Order(val orderId: String, val openTracking: Boolean = false) : DeepLink
    data class Offer(val offerId: String) : DeepLink
    data class Delivery(val deliveryId: String) : DeepLink
    data class Ticket(val ticketId: String) : DeepLink
    data class PaymentReturn(val orderId: String?) : DeepLink
}

object DeepLinks {
    const val SCHEME = "qabnah"

    /** Ids are UUIDs or similar opaque tokens; anything else (slashes, `..`, query characters) is rejected. */
    private val ID = Regex("^[A-Za-z0-9_-]{1,64}$")

    fun isValidId(id: String?): Boolean = id != null && ID.matches(id)

    /** Parses a `qabnah://…` URI; returns null for other schemes, unknown hosts or malformed ids. */
    fun parse(uri: String?): DeepLink? {
        if (uri.isNullOrBlank()) return null
        val text = uri.trim()
        val schemeEnd = text.indexOf("://")
        if (schemeEnd <= 0 || !text.substring(0, schemeEnd).equals(SCHEME, ignoreCase = true)) return null
        var rest = text.substring(schemeEnd + 3)
        rest = rest.substringBefore('#')
        val query = if ('?' in rest) parseQuery(rest.substringAfter('?')) else emptyMap()
        val segments = rest.substringBefore('?').split('/').filter { it.isNotEmpty() }
        val host = segments.firstOrNull()?.lowercase() ?: return null
        val id = segments.getOrNull(1)
        if (segments.size > 2) return null
        return when (host) {
            "order" -> id?.takeIf(::isValidId)?.let { DeepLink.Order(it, openTracking = query["track"].isTruthy()) }
            "offer" -> id?.takeIf(::isValidId)?.let { DeepLink.Offer(it) }
            "delivery" -> id?.takeIf(::isValidId)?.let { DeepLink.Delivery(it) }
            "ticket" -> id?.takeIf(::isValidId)?.let { DeepLink.Ticket(it) }
            "payment-return" -> if (id == null) DeepLink.PaymentReturn(query["orderId"]?.takeIf(::isValidId)) else null
            else -> null
        }
    }

    fun toUri(link: DeepLink): String = when (link) {
        is DeepLink.Order -> "$SCHEME://order/${link.orderId}" + if (link.openTracking) "?track=1" else ""
        is DeepLink.Offer -> "$SCHEME://offer/${link.offerId}"
        is DeepLink.Delivery -> "$SCHEME://delivery/${link.deliveryId}"
        is DeepLink.Ticket -> "$SCHEME://ticket/${link.ticketId}"
        is DeepLink.PaymentReturn -> "$SCHEME://payment-return" + (link.orderId?.let { "?orderId=$it" } ?: "")
    }

    private fun parseQuery(q: String): Map<String, String> =
        q.split('&').mapNotNull { part ->
            if (part.isEmpty()) return@mapNotNull null
            val k = part.substringBefore('=')
            val v = if ('=' in part) part.substringAfter('=') else ""
            k to v
        }.toMap()

    private fun String?.isTruthy() = this == "1" || this.equals("true", ignoreCase = true)
}
