package om.qabnah.core.realtime

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import om.qabnah.core.QabnahJson
import om.qabnah.core.model.Offer

/** Channel names from the contract. */
object Channels {
    fun order(id: String) = "order:$id"
    fun delivery(id: String) = "delivery:$id"
    const val CAPTAIN_ME = "captain:me"
    const val USER_ME = "user:me"
}

/** Event names from the contract. */
object RealtimeEvents {
    const val ORDER_CREATED = "order.created"
    const val ORDER_STATUS_CHANGED = "order.status_changed"
    const val DELIVERY_STATUS_CHANGED = "delivery.status_changed"
    const val DELIVERY_ASSIGNED = "delivery.assigned"
    const val DELIVERY_LOCATION = "delivery.location"
    const val OFFER_CREATED = "offer.created"
    const val OFFER_EXPIRED = "offer.expired"
    const val OFFER_CANCELLED = "offer.cancelled"
    const val NOTIFICATION_CREATED = "notification.created"
}

/** Server → client frames. */
sealed interface RealtimeMessage {
    data class Subscribed(val channel: String) : RealtimeMessage
    data class Error(val code: String, val channel: String?, val message: String?) : RealtimeMessage
    data class Event(val channel: String, val event: String, val data: JsonObject, val id: Long?) : RealtimeMessage
    data object Pong : RealtimeMessage
    data class Unknown(val raw: JsonObject) : RealtimeMessage

    companion object {
        /** Returns null for frames that are not JSON objects. */
        fun parse(text: String, json: Json = QabnahJson): RealtimeMessage? {
            val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return null
            fun str(key: String) = (obj[key] as? JsonPrimitive)?.contentOrNull
            return when (str("type")) {
                "subscribed" -> Subscribed(str("channel").orEmpty())
                "error" -> Error(str("code") ?: "error", str("channel"), str("message"))
                "pong" -> Pong
                "event" -> Event(
                    channel = str("channel").orEmpty(),
                    event = str("event").orEmpty(),
                    data = obj["data"] as? JsonObject ?: JsonObject(emptyMap()),
                    id = (obj["id"] as? JsonPrimitive)?.longOrNull,
                )
                else -> Unknown(obj)
            }
        }
    }
}

/** `delivery.location` payload: `{lat,lng,heading,etaDropoffAt}`. */
@Serializable
data class DeliveryLocationData(
    val lat: Double,
    val lng: Double,
    val heading: Double? = null,
    val etaDropoffAt: String? = null,
)

fun RealtimeMessage.Event.deliveryLocation(json: Json = QabnahJson): DeliveryLocationData? =
    if (event != RealtimeEvents.DELIVERY_LOCATION) null
    else runCatching { json.decodeFromJsonElement(DeliveryLocationData.serializer(), data) }.getOrNull()

/**
 * `offer.*` payload. The contract does not pin its shape; accept either the Offer itself or `{offer: Offer}`.
 * Returns null when neither shape matches (callers then refetch `GET /captain/offers`).
 */
fun RealtimeMessage.Event.offerOrNull(json: Json = QabnahJson): Offer? {
    val candidate = (data["offer"] as? JsonObject) ?: data
    if (candidate["id"] == null) return null
    return runCatching { json.decodeFromJsonElement(Offer.serializer(), candidate) }.getOrNull()
        ?.takeIf { it.id.isNotBlank() }
}

/** Best-effort id of the affected offer for expired/cancelled events (`offerId` or `id`). */
fun RealtimeMessage.Event.offerId(): String? =
    ((data["offerId"] ?: (data["offer"] as? JsonObject)?.get("id") ?: data["id"]) as? JsonPrimitive)?.contentOrNull
