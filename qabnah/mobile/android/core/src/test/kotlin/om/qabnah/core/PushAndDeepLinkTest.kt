package om.qabnah.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import om.qabnah.core.push.ClientApp
import om.qabnah.core.push.DeepLink
import om.qabnah.core.push.DeepLinks
import om.qabnah.core.push.PushChannel
import om.qabnah.core.push.PushPayload
import om.qabnah.core.push.PushRouting
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PushAndDeepLinkTest {
    private val orderId = "6f1c2a52-6a7e-4d61-9a63-3b1f7a2d9c01"

    private fun data(fixture: String): Map<String, String> =
        Json.parseToJsonElement(Fixtures.read(fixture)).let { it as JsonObject }.mapValues { it.value.jsonPrimitive.content }

    @Test
    fun `parses the contract deep links`() {
        assertEquals(DeepLink.Order(orderId), DeepLinks.parse("qabnah://order/$orderId"))
        assertEquals(DeepLink.Offer("off-1"), DeepLinks.parse("qabnah://offer/off-1"))
        assertEquals(DeepLink.Delivery("d_1"), DeepLinks.parse("QABNAH://delivery/d_1/"))
        assertEquals(DeepLink.Ticket("t-9"), DeepLinks.parse("qabnah://ticket/t-9#frag"))
        assertEquals(DeepLink.Order(orderId, openTracking = true), DeepLinks.parse("qabnah://order/$orderId?track=1"))
        assertEquals(DeepLink.PaymentReturn(orderId), DeepLinks.parse("qabnah://payment-return?orderId=$orderId&paymentId=p1&outcome=paid"))
        assertEquals(DeepLink.PaymentReturn(null), DeepLinks.parse("qabnah://payment-return"))
    }

    @Test
    fun `rejects other schemes, unknown hosts and unsafe ids`() {
        assertNull(DeepLinks.parse(null))
        assertNull(DeepLinks.parse(""))
        assertNull(DeepLinks.parse("https://qabnah.om/order/1"))
        assertNull(DeepLinks.parse("qabnah://order"))
        assertNull(DeepLinks.parse("qabnah://order/"))
        assertNull(DeepLinks.parse("qabnah://unknown/1"))
        assertNull(DeepLinks.parse("qabnah://order/1/extra"))
        assertNull(DeepLinks.parse("qabnah://order/..%2F..%2Fadmin"))
        assertNull(DeepLinks.parse("qabnah://ticket/a b"))
        assertNull(DeepLinks.parse("qabnah://offer/" + "x".repeat(65)))
    }

    @Test
    fun `deep link uris round-trip`() {
        listOf(
            DeepLink.Order(orderId), DeepLink.Order(orderId, openTracking = true), DeepLink.Offer("o1"),
            DeepLink.Delivery("d1"), DeepLink.Ticket("t1"), DeepLink.PaymentReturn("x1"), DeepLink.PaymentReturn(null),
        ).forEach { assertEquals(it, DeepLinks.parse(DeepLinks.toUri(it))) }
        assertEquals("qabnah://order/$orderId", DeepLinks.toUri(DeepLink.Order(orderId)))
    }

    @Test
    fun `decodes push data maps and treats blanks as absent`() {
        val p = PushPayload.from(data("push_support_reply.json"), title = "رد جديد", body = " ")
        assertEquals("support.reply", p.type)
        assertEquals("5c4b3a29-1807-4f6e-9d5c-4b3a29180716", p.ticketId)
        assertNull(p.orderId)
        assertNull(p.number)
        assertEquals("رد جديد", p.title)
        assertNull(p.body)
        assertTrue(p.isQabnahPush)

        val fromExtras = PushPayload.from(mapOf("title" to "T", "body" to "B", "type" to "order.accepted", "orderId" to orderId, "google.message_id" to "0:1"))
        assertEquals("T", fromExtras.title)
        assertEquals("B", fromExtras.body)
        assertEquals(orderId, fromExtras.orderId)

        assertFalse(PushPayload.from(mapOf("profile" to "0")).isQabnahPush)
        assertNull(PushPayload.from(mapOf("orderId" to "../x")).orderId)
    }

    @Test
    fun `consumer routing opens orders, tracking and tickets`() {
        val app = ClientApp.CONSUMER
        val picked = PushPayload.from(data("push_delivery_picked_up.json"))
        assertEquals(DeepLink.Order(orderId, openTracking = true), PushRouting.deepLink(picked, app))
        assertEquals(PushChannel.ORDERS, PushRouting.channel(picked, app))

        val accepted = PushPayload(type = "order.accepted", orderId = orderId)
        assertEquals(DeepLink.Order(orderId), PushRouting.deepLink(accepted, app))

        val paid = PushPayload(type = "payment_link.paid", orderId = orderId)
        assertEquals(DeepLink.Order(orderId), PushRouting.deepLink(paid, app))

        val reply = PushPayload.from(data("push_support_reply.json"))
        assertEquals(DeepLink.Ticket("5c4b3a29-1807-4f6e-9d5c-4b3a29180716"), PushRouting.deepLink(reply, app))
        assertEquals(PushChannel.SUPPORT, PushRouting.channel(reply, app))

        // Offers never use the captain-only channel in the consumer app.
        assertEquals(PushChannel.ORDERS, PushRouting.channel(PushPayload(type = "offer.created", offerId = "o1"), app))
        assertNull(PushRouting.deepLink(PushPayload(type = "merchant.approved"), app))
    }

    @Test
    fun `captain routing opens offers, deliveries and tickets`() {
        val app = ClientApp.CAPTAIN
        val offer = PushPayload.from(data("push_offer_created.json"))
        assertEquals(DeepLink.Offer("0b9d6c1e-2f4a-4c55-8f61-1d2e3f4a5b6c"), PushRouting.deepLink(offer, app))
        assertEquals(PushChannel.OFFERS, PushRouting.channel(offer, app))

        val picked = PushPayload.from(data("push_delivery_picked_up.json"))
        assertEquals(DeepLink.Delivery("9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"), PushRouting.deepLink(picked, app))
        assertEquals(PushChannel.ORDERS, PushRouting.channel(picked, app))

        val reply = PushPayload(type = "support.reply", ticketId = "t1")
        assertEquals(DeepLink.Ticket("t1"), PushRouting.deepLink(reply, app))
        assertEquals(PushChannel.SUPPORT, PushRouting.channel(reply, app))

        // Captain has no order screen: an order-only push just opens the app.
        assertNull(PushRouting.deepLink(PushPayload(type = "order.cancelled", orderId = orderId), app))
        assertNull(PushRouting.deepLink(PushPayload(type = "captain.approved"), app))
    }

    @Test
    fun `notification ids are stable per entity and outside app ranges`() {
        val a = PushRouting.notificationId(PushPayload(type = "order.accepted", orderId = orderId))
        val b = PushRouting.notificationId(PushPayload(type = "delivery.picked_up", orderId = orderId))
        val c = PushRouting.notificationId(PushPayload(type = "order.accepted", orderId = "other"))
        assertEquals(a, b)
        assertNotEquals(a, c)
        listOf(a, c, PushRouting.notificationId(PushPayload())).forEach { assertTrue(it >= 100_000) }
    }
}
