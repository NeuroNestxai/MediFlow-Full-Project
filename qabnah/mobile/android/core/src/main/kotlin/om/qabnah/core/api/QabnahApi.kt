package om.qabnah.core.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import om.qabnah.core.model.Address
import om.qabnah.core.model.AddressInput
import om.qabnah.core.model.AuthResult
import om.qabnah.core.model.AvailabilitySlot
import om.qabnah.core.model.CaptainDeliveriesPage
import om.qabnah.core.model.CaptainDelivery
import om.qabnah.core.model.CaptainDocument
import om.qabnah.core.model.CaptainDocumentInput
import om.qabnah.core.model.CaptainProfile
import om.qabnah.core.model.CaptainProfileInput
import om.qabnah.core.model.CaptainStatusInput
import om.qabnah.core.model.Checkout
import om.qabnah.core.model.CompleteDeliveryInput
import om.qabnah.core.model.DeliveryAction
import om.qabnah.core.model.DeliveryQuote
import om.qabnah.core.model.DeliveryQuoteRequest
import om.qabnah.core.model.DeliveryStatusInput
import om.qabnah.core.model.DeleteAccountInput
import om.qabnah.core.model.DeviceRegistration
import om.qabnah.core.model.DeviceUnregistration
import om.qabnah.core.model.Earnings
import om.qabnah.core.model.FilePurpose
import om.qabnah.core.model.FileRef
import om.qabnah.core.model.Items
import om.qabnah.core.model.LatLng
import om.qabnah.core.model.LocationPing
import om.qabnah.core.model.MarketplaceOrderInput
import om.qabnah.core.model.Me
import om.qabnah.core.model.MerchantCategory
import om.qabnah.core.model.NewTicket
import om.qabnah.core.model.NotificationPage
import om.qabnah.core.model.Offer
import om.qabnah.core.model.Order
import om.qabnah.core.model.OtpRequestResult
import om.qabnah.core.model.Page
import om.qabnah.core.model.PriceBreakdown
import om.qabnah.core.model.ProfileUpdate
import om.qabnah.core.model.RatingInput
import om.qabnah.core.model.Settlement
import om.qabnah.core.model.ShipmentInput
import om.qabnah.core.model.Storefront
import om.qabnah.core.model.StoresPage
import om.qabnah.core.model.Ticket
import om.qabnah.core.model.Tracking
import om.qabnah.core.model.Zone

/** Typed endpoints from API_CONTRACT.yaml used by the consumer and captain apps. */
class QabnahApi(val client: ApiClient) {

    // ───────── Auth ─────────

    suspend fun requestOtp(phone: String): OtpRequestResult =
        client.post<PhoneBody, OtpRequestResult>("auth/otp/request", PhoneBody(phone), auth = false)

    /** Verifies the code and stores the session. */
    suspend fun verifyOtp(phone: String, code: String, fullName: String? = null): AuthResult {
        val result = client.post<VerifyBody, AuthResult>(
            "auth/otp/verify",
            VerifyBody(phone, code, fullName?.takeIf { it.isNotBlank() }),
            auth = false,
        )
        client.saveSession(result)
        return result
    }

    /** Revokes the refresh token server-side (best effort) and always clears the local session. */
    suspend fun logout() {
        val refresh = client.currentRefreshToken()
        try {
            if (refresh != null) client.post<RefreshTokenBody, Unit>("auth/logout", RefreshTokenBody(refresh))
        } catch (_: ApiException) {
            // Signing out locally must never fail.
        } finally {
            client.clearSession()
        }
    }

    // ───────── Me ─────────

    suspend fun me(): Me = client.get("me")
    suspend fun updateMe(update: ProfileUpdate): Me = client.patch("me", update)
    suspend fun addresses(): List<Address> = client.get<Items<Address>>("me/addresses").items
    suspend fun createAddress(input: AddressInput): Address = client.post("me/addresses", input)
    suspend fun updateAddress(id: String, input: AddressInput): Address = client.patch("me/addresses/$id", input)
    suspend fun deleteAddress(id: String) = client.delete("me/addresses/$id")
    suspend fun notifications(limit: Int = 20, offset: Int = 0): NotificationPage =
        client.get("me/notifications", mapOf("limit" to limit, "offset" to offset))
    suspend fun markNotificationRead(id: String) = client.postEmpty<Unit>("me/notifications/$id/read")

    /** `app` is `consumer` or `captain`. */
    suspend fun registerDevice(app: String, token: String) =
        client.post<DeviceRegistration, Unit>("me/devices", DeviceRegistration("android", app, token))

    /** `POST /me/devices/unregister` – call before signing out so this device stops receiving pushes. */
    suspend fun unregisterDevice(token: String) =
        client.post<DeviceUnregistration, Unit>("me/devices/unregister", DeviceUnregistration(token))

    /** `GET /me/export` – personal data export (PDPL access right). Use [DataExport.toPrettyJson] to save it. */
    suspend fun exportMyData(): JsonElement = client.get("me/export")

    /**
     * `POST /me/delete {confirm:"DELETE"}` (PDPL erasure). On 204 the server has revoked every session, so the local
     * session is cleared too. A 409 ([ApiException.Conflict]: active orders/deliveries or an unsettled balance) leaves
     * the session untouched; show its message.
     */
    suspend fun deleteAccount() {
        client.post<DeleteAccountInput, Unit>("me/delete", DeleteAccountInput())
        client.clearSession()
    }

    suspend fun uploadFile(bytes: ByteArray, fileName: String, mimeType: String, purpose: FilePurpose): FileRef {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("purpose", purpose.wire)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaTypeOrNull()))
            .build()
        return client.executeMultipart("files", body, FileRef.serializer())
    }

    // ───────── Public ─────────

    suspend fun zones(): List<Zone> = client.get<Items<Zone>>("zones", auth = false).items

    suspend fun stores(
        location: LatLng? = null,
        category: MerchantCategory? = null,
        query: String? = null,
        limit: Int = 20,
        offset: Int = 0,
    ): StoresPage = client.get(
        "stores",
        mapOf(
            "lat" to location?.lat,
            "lng" to location?.lng,
            "category" to category?.wire,
            "q" to query?.takeIf { it.isNotBlank() },
            "limit" to limit,
            "offset" to offset,
        ),
        auth = false,
    )

    suspend fun storefront(slug: String): Storefront = client.get("stores/$slug", auth = false)

    suspend fun deliveryQuote(request: DeliveryQuoteRequest): DeliveryQuote =
        client.post("quotes/delivery", request, auth = false)

    // ───────── Consumer ─────────

    suspend fun quoteOrder(input: MarketplaceOrderInput): PriceBreakdown = client.post("orders/quote", input)
    suspend fun placeOrder(input: MarketplaceOrderInput, idempotencyKey: String): Order =
        client.post("orders", input, idempotencyKey = idempotencyKey)
    suspend fun createShipment(input: ShipmentInput, idempotencyKey: String): Order =
        client.post("shipments", input, idempotencyKey = idempotencyKey)

    /** [status] is `active` or `past` (null = all). */
    suspend fun orders(status: String? = null, limit: Int = 20, offset: Int = 0): Page<Order> =
        client.get("orders", mapOf("status" to status, "limit" to limit, "offset" to offset))

    suspend fun order(id: String): Order = client.get("orders/$id")
    suspend fun cancelOrder(id: String, reason: String?): Order = client.post("orders/$id/cancel", ReasonBody(reason))
    suspend fun checkout(orderId: String, returnUrl: String?): Checkout =
        client.post("orders/$orderId/checkout", ReturnUrlBody(returnUrl))
    suspend fun tracking(orderId: String): Tracking = client.get("orders/$orderId/tracking")
    suspend fun rateOrder(orderId: String, rating: RatingInput) = client.post<RatingInput, Unit>("orders/$orderId/rating", rating)

    suspend fun tickets(): List<Ticket> = client.get<Items<Ticket>>("support/tickets").items
    suspend fun createTicket(ticket: NewTicket): Ticket = client.post("support/tickets", ticket)
    suspend fun ticket(id: String): Ticket = client.get("support/tickets/$id")
    suspend fun replyTicket(id: String, body: String) =
        client.post<MessageBody, Unit>("support/tickets/$id/messages", MessageBody(body))

    // ───────── Captain ─────────

    suspend fun registerCaptain(input: CaptainProfileInput): CaptainProfile = client.post("captain/register", input)
    suspend fun captainProfile(): CaptainProfile = client.get("captain/profile")
    suspend fun updateCaptainProfile(input: CaptainProfileInput): CaptainProfile = client.patch("captain/profile", input)
    suspend fun addCaptainDocument(input: CaptainDocumentInput): CaptainDocument = client.post("captain/documents", input)
    suspend fun setCaptainZones(zoneIds: List<String>): CaptainProfile = client.put("captain/zones", ZoneIdsBody(zoneIds))
    suspend fun setCaptainAvailability(slots: List<AvailabilitySlot>): CaptainProfile =
        client.put("captain/availability", SlotsBody(slots))
    suspend fun setCaptainStatus(online: Boolean, location: LatLng?): CaptainProfile =
        client.post("captain/status", CaptainStatusInput(online, location))
    suspend fun postCaptainLocation(ping: LocationPing) = client.post<LocationPing, Unit>("captain/location", ping)
    suspend fun offers(): List<Offer> = client.get<Items<Offer>>("captain/offers").items
    suspend fun acceptOffer(id: String): CaptainDelivery = client.postEmpty("captain/offers/$id/accept")
    suspend fun rejectOffer(id: String, reason: String?) =
        client.post<ReasonBody, Unit>("captain/offers/$id/reject", ReasonBody(reason))

    /** [status] is `active` or `history`. */
    suspend fun captainDeliveries(status: String?, limit: Int = 20, offset: Int = 0): CaptainDeliveriesPage =
        client.get("captain/deliveries", mapOf("status" to status, "limit" to limit, "offset" to offset))
    suspend fun captainDelivery(id: String): CaptainDelivery = client.get("captain/deliveries/$id")
    suspend fun advanceDelivery(id: String, action: DeliveryAction, reason: String?, location: LatLng?): CaptainDelivery {
        require(action != DeliveryAction.COMPLETE) { "Use completeDelivery() for the complete action" }
        return client.post("captain/deliveries/$id/status", DeliveryStatusInput(action, reason, location))
    }
    suspend fun completeDelivery(id: String, input: CompleteDeliveryInput): CaptainDelivery =
        client.post("captain/deliveries/$id/complete", input)

    /** Dates are `yyyy-MM-dd`. */
    suspend fun earnings(from: String?, to: String?): Earnings =
        client.get("captain/earnings", mapOf("from" to from, "to" to to))
    suspend fun payouts(): List<Settlement> = client.get<Items<Settlement>>("captain/payouts").items

    @Serializable private data class PhoneBody(val phone: String)
    @Serializable private data class VerifyBody(val phone: String, val code: String, val fullName: String? = null)
    @Serializable private data class RefreshTokenBody(val refreshToken: String)
    @Serializable private data class ReasonBody(val reason: String? = null)
    @Serializable private data class ReturnUrlBody(val returnUrl: String? = null)
    @Serializable private data class MessageBody(val body: String)
    @Serializable private data class ZoneIdsBody(val zoneIds: List<String>)
    @Serializable private data class SlotsBody(val slots: List<AvailabilitySlot>)
}
