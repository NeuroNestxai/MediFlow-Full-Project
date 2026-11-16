package om.qabnah.core

import kotlinx.serialization.json.jsonPrimitive
import om.qabnah.core.api.ApiException
import om.qabnah.core.model.CaptainDelivery
import om.qabnah.core.model.CaptainDocType
import om.qabnah.core.model.CaptainProfile
import om.qabnah.core.model.CaptainStatus
import om.qabnah.core.model.DeliveryAction
import om.qabnah.core.model.DeliveryStatus
import om.qabnah.core.model.LatLng
import om.qabnah.core.model.Me
import om.qabnah.core.model.MarketplaceOrderInput
import om.qabnah.core.model.MerchantCategory
import om.qabnah.core.model.Offer
import om.qabnah.core.model.OptionGroupKind
import om.qabnah.core.model.Order
import om.qabnah.core.model.OrderItemInput
import om.qabnah.core.model.OrderStatus
import om.qabnah.core.model.OrderType
import om.qabnah.core.model.PackageSize
import om.qabnah.core.model.PaymentMethod
import om.qabnah.core.model.PlaceInput
import om.qabnah.core.model.ShipmentInput
import om.qabnah.core.model.ShipmentPackage
import om.qabnah.core.model.CodPayer
import om.qabnah.core.model.Storefront
import om.qabnah.core.model.Tracking
import om.qabnah.core.model.VehicleType
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ModelDecodingTest {
    private val json = QabnahJson

    @Test
    fun `decodes order with delivery, captain and timeline, ignoring unknown fields`() {
        val order = json.decodeFromString(Order.serializer(), Fixtures.read("order.json"))
        assertEquals("QB100001", order.number)
        assertEquals(OrderType.MARKETPLACE, order.type)
        assertEquals(OrderStatus.OUT_FOR_DELIVERY, order.status)
        assertEquals(PaymentMethod.COD, order.paymentMethod)
        assertEquals(2000L, order.totalBaisa)
        assertEquals(1, order.items.size)
        assertEquals("Large", order.items[0].options[0].nameEn)
        val d = order.delivery!!
        assertEquals(DeliveryStatus.PICKED_UP, d.status)
        assertEquals("4821", d.deliveryPin)
        assertEquals("Ahmed", d.captain!!.firstName)
        assertEquals(VehicleType.BIKE, d.captain!!.vehicleType)
        assertEquals(90.0, d.captain!!.location!!.heading)
        assertEquals(3, order.timeline.size)
        assertTrue(order.isTrackable)
        assertFalse(order.canProbablyCancel)
        assertFalse(order.canRate)
    }

    @Test
    fun `decodes storefront with option groups`() {
        val sf = json.decodeFromString(Storefront.serializer(), Fixtures.read("storefront.json"))
        assertEquals(MerchantCategory.CAFE, sf.merchant.category)
        assertEquals("#7A1F2B", sf.merchant.brandColor)
        assertFalse(sf.merchant.acceptsOnline)
        assertEquals(1500L, sf.merchant.minOrderBaisa)
        assertEquals(1, sf.banners.size)
        val p = sf.categories.single().products.single()
        assertEquals(2, p.optionGroups.size)
        assertEquals(OptionGroupKind.VARIANT, p.optionGroups[0].kind)
        assertEquals(OptionGroupKind.ADDON, p.optionGroups[1].kind)
        assertFalse(p.optionGroups[1].options[2].isAvailable)
        assertEquals(0, sf.merchant.openingHours.first().weekday)
    }

    @Test
    fun `decodes offer`() {
        val offer = json.decodeFromString(Offer.serializer(), Fixtures.read("offer.json"))
        assertEquals(850L, offer.earningBaisa)
        assertEquals(2000L, offer.codAmountBaisa)
        assertEquals("Qurum", offer.dropoffArea)
        assertEquals(LatLng(23.6, 58.41), offer.dropoffLocation)
    }

    @Test
    fun `decodes captain profile and tolerates unknown document types`() {
        val p = json.decodeFromString(CaptainProfile.serializer(), Fixtures.read("captain_profile.json"))
        assertEquals(CaptainStatus.PENDING_DOCUMENTS, p.status)
        assertFalse(p.canGoOnline)
        assertEquals(VehicleType.CAR, p.vehicleType)
        assertEquals(4, p.requiredDocuments.size)
        assertEquals(CaptainDocType.UNKNOWN, p.documents[2].docType)
        // the newer national_id upload supersedes the rejected one
        assertEquals("doc-2", p.latestDocument(CaptainDocType.NATIONAL_ID)!!.id)
        assertEquals(listOf(CaptainDocType.DRIVING_LICENSE, CaptainDocType.VEHICLE_REGISTRATION, CaptainDocType.PROFILE_PHOTO), p.missingDocuments)
    }

    @Test
    fun `decodes captain delivery next actions with unknown values`() {
        val d = json.decodeFromString(CaptainDelivery.serializer(), Fixtures.read("captain_delivery.json"))
        assertEquals(listOf(DeliveryAction.ARRIVE_PICKUP, DeliveryAction.RELEASE, DeliveryAction.UNKNOWN), d.nextActions)
        assertTrue(d.headingToPickup)
        assertTrue(d.pinRequired)
        assertEquals("+96891234567", d.dropoff.contactPhone)
    }

    @Test
    fun `decodes tracking`() {
        val t = json.decodeFromString(Tracking.serializer(), Fixtures.read("tracking.json"))
        assertEquals(DeliveryStatus.AT_DROPOFF, t.deliveryStatus)
        assertEquals(2, t.path.size)
        assertNull(t.captain!!.location)
    }

    @Test
    fun `decodes me without captain`() {
        val me = json.decodeFromString(Me.serializer(), Fixtures.read("me_consumer.json"))
        assertEquals("Salim", me.user.fullName)
        assertNull(me.captain)
    }

    @Test
    fun `maps error envelope to validation exception with field errors`() {
        val e = ApiException.fromResponse(422, Fixtures.read("error_validation.json"))
        assertIs<ApiException.Validation>(e)
        assertEquals("validation_error", e.code)
        assertEquals("Invalid delivery PIN", e.message)
        assertEquals("Invalid delivery PIN", e.fieldErrors["pin"])
    }

    @Test
    fun `unknown enum values fall back instead of failing`() {
        val o = json.decodeFromString(Order.serializer(), """{"id":"x","status":"teleported","type":"drone"}""")
        assertEquals(OrderStatus.UNKNOWN, o.status)
        assertEquals(OrderType.UNKNOWN, o.type)
    }

    @Test
    fun `encodes marketplace order input with wire names and without nulls`() {
        val input = MarketplaceOrderInput(
            merchantId = "m-1",
            items = listOf(OrderItemInput("p-1", 2, listOf("o-l"))),
            addressId = "a-1",
            paymentMethod = PaymentMethod.ONLINE,
        )
        val obj = json.parseToJsonElement(json.encodeToString(MarketplaceOrderInput.serializer(), input)).jsonObject
        assertEquals("online", obj["paymentMethod"]!!.jsonPrimitive.content)
        assertEquals("app", obj["source"]!!.jsonPrimitive.content)
        assertFalse("dropoff" in obj)
        assertFalse("notes" in obj)
    }

    @Test
    fun `encodes shipment with package key and cod payer`() {
        val input = ShipmentInput(
            pickup = PlaceInput(LatLng(23.58, 58.38), contactName = "A", contactPhone = "+96891234567"),
            dropoff = PlaceInput(LatLng(23.60, 58.41), contactName = "B", contactPhone = "+96899887766"),
            pkg = ShipmentPackage(PackageSize.SMALL, "Keys"),
            paymentMethod = PaymentMethod.COD,
            codPayer = CodPayer.RECIPIENT,
        )
        val obj = json.parseToJsonElement(json.encodeToString(ShipmentInput.serializer(), input)).jsonObject
        assertEquals("small", obj["package"]!!.jsonObject["size"]!!.jsonPrimitive.content)
        assertEquals("recipient", obj["codPayer"]!!.jsonPrimitive.content)
        assertEquals("cod", obj["paymentMethod"]!!.jsonPrimitive.content)
    }
}
