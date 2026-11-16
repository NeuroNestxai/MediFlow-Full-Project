package om.qabnah.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// Models mirror components/schemas in API_CONTRACT.yaml. Every field has a default so that a field the
// server omits never crashes decoding; money is integer baisa (Long).

@Serializable
data class LatLng(val lat: Double, val lng: Double)

@Serializable
data class Tokens(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long = 900,
)

@Serializable
data class User(
    val id: String = "",
    val phone: String? = null,
    val email: String? = null,
    val fullName: String = "",
    val locale: String = "ar",
    val status: String = "",
)

@Serializable
data class AuthResult(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long = 900,
    val user: User = User(),
    val isNewUser: Boolean = false,
) {
    fun tokens() = Tokens(accessToken, refreshToken, expiresIn)
}

@Serializable
data class OtpRequestResult(
    val sent: Boolean = false,
    val expiresInSeconds: Int = 0,
    /** Only present when the server runs with OTP_DEV_ECHO=true (never in production). */
    val devCode: String? = null,
)

@Serializable
data class RoleRef(val key: String = "", val merchantId: String? = null)

@Serializable
data class MeMerchant(
    val id: String = "",
    val slug: String = "",
    val nameEn: String = "",
    val nameAr: String = "",
    val status: String = "",
    val logoUrl: String? = null,
    val permissions: List<String> = emptyList(),
)

@Serializable
data class Me(
    val user: User = User(),
    val roles: List<RoleRef> = emptyList(),
    val permissions: List<String> = emptyList(),
    val merchants: List<MeMerchant> = emptyList(),
    val captain: CaptainProfile? = null,
)

@Serializable
data class AddressInput(
    val label: String? = null,
    val location: LatLng,
    val area: String? = null,
    val street: String? = null,
    val building: String? = null,
    val floor: String? = null,
    val apartment: String? = null,
    val landmark: String? = null,
    val contactName: String? = null,
    val contactPhone: String? = null,
    val isDefault: Boolean? = null,
)

@Serializable
data class Address(
    val id: String = "",
    val label: String? = null,
    val location: LatLng = LatLng(0.0, 0.0),
    val area: String? = null,
    val street: String? = null,
    val building: String? = null,
    val floor: String? = null,
    val apartment: String? = null,
    val landmark: String? = null,
    val contactName: String? = null,
    val contactPhone: String? = null,
    val isDefault: Boolean = false,
    /** Zone covering this address, null if outside the service area. */
    val zoneId: String? = null,
    val createdAt: String? = null,
) {
    val isInServiceArea: Boolean get() = zoneId != null

    fun toInput(isDefault: Boolean? = this.isDefault) = AddressInput(
        label, location, area, street, building, floor, apartment, landmark, contactName, contactPhone, isDefault,
    )

    /** Single-line human summary ("Al Khuwair, Way 3021, Bldg 12, Flat 4"). */
    fun summary(): String = listOfNotNull(area, street, building, apartment, landmark)
        .filter { it.isNotBlank() }
        .joinToString(", ")
}

@Serializable
data class FileRef(
    val id: String = "",
    val url: String = "",
    val mimeType: String? = null,
    val sizeBytes: Long = 0,
)

@Serializable
data class Zone(
    val id: String = "",
    val code: String = "",
    val nameEn: String = "",
    val nameAr: String = "",
    val isActive: Boolean = true,
    val boundary: JsonElement? = null,
)

@Serializable
data class MerchantSummary(
    val id: String = "",
    val slug: String = "",
    val nameEn: String = "",
    val nameAr: String = "",
    val category: MerchantCategory = MerchantCategory.UNKNOWN,
    val logoUrl: String? = null,
    val coverUrl: String? = null,
    val brandColor: String? = null,
    val accentColor: String? = null,
    val taglineEn: String? = null,
    val taglineAr: String? = null,
    val ratingAvg: Double = 0.0,
    val ratingCount: Int = 0,
    val isOpen: Boolean = false,
    val prepTimeMinutes: Int = 0,
    val minOrderBaisa: Long = 0,
    val acceptsCod: Boolean = false,
    val acceptsOnline: Boolean = false,
    val distanceM: Int? = null,
    val location: LatLng? = null,
)

@Serializable
data class OpeningHours(val weekday: Int = 0, val open: String = "", val close: String = "")

/** `Storefront.merchant` = MerchantSummary + addressText, whatsappPhone, openingHours. */
@Serializable
data class StorefrontMerchant(
    val id: String = "",
    val slug: String = "",
    val nameEn: String = "",
    val nameAr: String = "",
    val category: MerchantCategory = MerchantCategory.UNKNOWN,
    val logoUrl: String? = null,
    val coverUrl: String? = null,
    val brandColor: String? = null,
    val accentColor: String? = null,
    val taglineEn: String? = null,
    val taglineAr: String? = null,
    val ratingAvg: Double = 0.0,
    val ratingCount: Int = 0,
    val isOpen: Boolean = false,
    val prepTimeMinutes: Int = 0,
    val minOrderBaisa: Long = 0,
    val acceptsCod: Boolean = false,
    val acceptsOnline: Boolean = false,
    val distanceM: Int? = null,
    val location: LatLng? = null,
    val addressText: String? = null,
    val whatsappPhone: String? = null,
    val openingHours: List<OpeningHours> = emptyList(),
)

@Serializable
data class Banner(
    val id: String = "",
    val imageUrl: String = "",
    val titleEn: String? = null,
    val titleAr: String? = null,
    val linkUrl: String? = null,
    val sortOrder: Int = 0,
    val isActive: Boolean = true,
)

@Serializable
data class ProductOption(
    val id: String = "",
    val nameEn: String = "",
    val nameAr: String = "",
    val priceDeltaBaisa: Long = 0,
    val isAvailable: Boolean = true,
)

@Serializable
data class OptionGroup(
    val id: String = "",
    val kind: OptionGroupKind = OptionGroupKind.UNKNOWN,
    val nameEn: String = "",
    val nameAr: String = "",
    val minSelect: Int = 0,
    val maxSelect: Int = 0,
    val options: List<ProductOption> = emptyList(),
)

@Serializable
data class Product(
    val id: String = "",
    val categoryId: String? = null,
    val nameEn: String = "",
    val nameAr: String = "",
    val descriptionEn: String? = null,
    val descriptionAr: String? = null,
    val imageUrl: String? = null,
    val sku: String? = null,
    val basePriceBaisa: Long = 0,
    val compareAtPriceBaisa: Long? = null,
    val isAvailable: Boolean = true,
    val trackStock: Boolean = false,
    val stockQty: Int = 0,
    val sortOrder: Int = 0,
    val optionGroups: List<OptionGroup> = emptyList(),
) {
    val isPurchasable: Boolean get() = isAvailable && (!trackStock || stockQty > 0)
}

@Serializable
data class StoreCategory(
    val id: String = "",
    val nameEn: String = "",
    val nameAr: String = "",
    val sortOrder: Int = 0,
    val isActive: Boolean = true,
    val products: List<Product> = emptyList(),
)

@Serializable
data class Storefront(
    val merchant: StorefrontMerchant = StorefrontMerchant(),
    val banners: List<Banner> = emptyList(),
    val categories: List<StoreCategory> = emptyList(),
    val uncategorized: List<Product> = emptyList(),
)

@Serializable
data class StoresPage(val items: List<MerchantSummary> = emptyList(), val total: Int = 0)

@Serializable
data class PlaceInput(
    val location: LatLng,
    val addressId: String? = null,
    val address: String? = null,
    val contactName: String? = null,
    val contactPhone: String? = null,
    val notes: String? = null,
)

@Serializable
data class Place(
    val location: LatLng? = null,
    val address: String? = null,
    val contactName: String? = null,
    /** Masked or hidden depending on viewer and delivery state. */
    val contactPhone: String? = null,
    val notes: String? = null,
)

@Serializable
data class OrderItemInput(
    val productId: String,
    val quantity: Int,
    val optionIds: List<String> = emptyList(),
    val notes: String? = null,
)

@Serializable
data class MarketplaceOrderInput(
    val merchantId: String,
    val items: List<OrderItemInput>,
    val addressId: String? = null,
    val dropoff: PlaceInput? = null,
    val paymentMethod: PaymentMethod,
    val notes: String? = null,
    val source: String = "app",
)

@Serializable
data class PriceLine(
    val productId: String? = null,
    val nameEn: String = "",
    val nameAr: String = "",
    val quantity: Int = 0,
    val unitPriceBaisa: Long = 0,
    val lineTotalBaisa: Long = 0,
    val options: List<JsonObject> = emptyList(),
)

@Serializable
data class PriceBreakdown(
    val subtotalBaisa: Long = 0,
    val deliveryFeeBaisa: Long = 0,
    val serviceFeeBaisa: Long = 0,
    val discountBaisa: Long = 0,
    val vatBaisa: Long = 0,
    val vatIncluded: Boolean = true,
    val totalBaisa: Long = 0,
    val distanceM: Int = 0,
    val estimatedDurationS: Int = 0,
    val currency: String = "OMR",
    val lines: List<PriceLine> = emptyList(),
)

@Serializable
data class DeliveryQuoteRequest(
    val type: OrderType,
    val pickup: LatLng,
    val dropoff: LatLng,
    val vehicleType: VehicleType? = null,
)

@Serializable
data class DeliveryQuote(
    val feeBaisa: Long = 0,
    val distanceM: Int = 0,
    val estimatedDurationS: Int = 0,
    val zoneId: String? = null,
    val vehicleType: String? = null,
    val currency: String = "OMR",
)

@Serializable
data class ShipmentPackage(
    val size: PackageSize,
    val description: String,
    val declaredValueBaisa: Long? = null,
)

@Serializable
data class ShipmentInput(
    val pickup: PlaceInput,
    val dropoff: PlaceInput,
    @kotlinx.serialization.SerialName("package") val pkg: ShipmentPackage,
    val vehicleType: VehicleType? = null,
    val paymentMethod: PaymentMethod,
    /** Required when paymentMethod = cod. */
    val codPayer: CodPayer? = null,
    val notes: String? = null,
)

@Serializable
data class OrderItemOption(
    val groupNameEn: String? = null,
    val nameEn: String = "",
    val nameAr: String = "",
    val priceDeltaBaisa: Long = 0,
)

@Serializable
data class OrderItem(
    val id: String = "",
    val productId: String? = null,
    val nameEn: String = "",
    val nameAr: String = "",
    val unitPriceBaisa: Long = 0,
    val quantity: Int = 0,
    val options: List<OrderItemOption> = emptyList(),
    val lineTotalBaisa: Long = 0,
    val notes: String? = null,
)

@Serializable
data class CaptainLocation(
    val lat: Double,
    val lng: Double,
    val heading: Double? = null,
    val updatedAt: String? = null,
)

@Serializable
data class CaptainPublic(
    val id: String = "",
    val firstName: String = "",
    val vehicleType: VehicleType = VehicleType.UNKNOWN,
    val vehiclePlate: String? = null,
    val vehicleColor: String? = null,
    val vehicleModel: String? = null,
    val ratingAvg: Double = 0.0,
    /** Only while the delivery is active. */
    val phone: String? = null,
    val location: CaptainLocation? = null,
)

@Serializable
data class Delivery(
    val id: String = "",
    val status: DeliveryStatus = DeliveryStatus.UNKNOWN,
    val vehicleType: String? = null,
    val pickup: Place = Place(),
    val dropoff: Place = Place(),
    val packageSize: String? = null,
    val packageDescription: String? = null,
    val distanceM: Int = 0,
    val estimatedDurationS: Int = 0,
    val feeBaisa: Long = 0,
    val codAmountBaisa: Long = 0,
    /** Shown to the customer/sender/merchant only, never to the captain. */
    val deliveryPin: String? = null,
    val pinRequired: Boolean = false,
    val captain: CaptainPublic? = null,
    val etaPickupAt: String? = null,
    val etaDropoffAt: String? = null,
    val assignedAt: String? = null,
    val pickedUpAt: String? = null,
    val deliveredAt: String? = null,
    val failureReason: String? = null,
)

@Serializable
data class OrderMerchant(
    val id: String = "",
    val slug: String = "",
    val nameEn: String = "",
    val nameAr: String = "",
    val logoUrl: String? = null,
    val contactPhone: String? = null,
)

@Serializable
data class TimelineEntry(val status: String = "", val at: String = "", val note: String? = null)

@Serializable
data class Order(
    val id: String = "",
    val number: String = "",
    val type: OrderType = OrderType.UNKNOWN,
    val source: String? = null,
    val status: OrderStatus = OrderStatus.UNKNOWN,
    val paymentMethod: PaymentMethod = PaymentMethod.UNKNOWN,
    val paymentStatus: String? = null,
    val codPayer: String? = null,
    val merchant: OrderMerchant? = null,
    val customerName: String? = null,
    val customerPhone: String? = null,
    val items: List<OrderItem> = emptyList(),
    val subtotalBaisa: Long = 0,
    val deliveryFeeBaisa: Long = 0,
    val serviceFeeBaisa: Long = 0,
    val discountBaisa: Long = 0,
    val vatBaisa: Long = 0,
    val totalBaisa: Long = 0,
    val codAmountBaisa: Long = 0,
    val currency: String = "OMR",
    val notes: String? = null,
    val prepTimeMinutes: Int? = null,
    val cancelReason: String? = null,
    val createdAt: String = "",
    val placedAt: String? = null,
    val acceptedAt: String? = null,
    val readyAt: String? = null,
    val deliveredAt: String? = null,
    val cancelledAt: String? = null,
    val delivery: Delivery? = null,
    val timeline: List<TimelineEntry> = emptyList(),
    val rated: Boolean = false,
) {
    /** Client-side hint only; the server is authoritative and answers 409 when cancelling is not allowed. */
    val canProbablyCancel: Boolean
        get() = when (type) {
            OrderType.C2C -> !status.isTerminal && (delivery?.status?.isBeforePickup ?: true)
            else -> status == OrderStatus.PENDING_PAYMENT || status == OrderStatus.PLACED
        }

    val canRate: Boolean get() = !rated && (status == OrderStatus.DELIVERED || status == OrderStatus.COMPLETED)
    val isTrackable: Boolean get() = !status.isTerminal && delivery?.status?.isTrackable == true
    val needsPayment: Boolean get() = status == OrderStatus.PENDING_PAYMENT && paymentMethod == PaymentMethod.ONLINE
}

@Serializable
data class Page<T>(
    val items: List<T> = emptyList(),
    val total: Int = 0,
    val limit: Int = 20,
    val offset: Int = 0,
)

@Serializable
data class Items<T>(val items: List<T> = emptyList())

@Serializable
data class Tracking(
    val orderId: String = "",
    val orderStatus: OrderStatus = OrderStatus.UNKNOWN,
    val deliveryStatus: DeliveryStatus? = null,
    val pickup: LatLng? = null,
    val dropoff: LatLng? = null,
    val captain: CaptainPublic? = null,
    val etaPickupAt: String? = null,
    val etaDropoffAt: String? = null,
    /** Recent breadcrumbs (max 200). */
    val path: List<LatLng> = emptyList(),
)

@Serializable
data class Checkout(
    val paymentId: String = "",
    val provider: String = "",
    val checkoutUrl: String = "",
    val status: String = "",
)

@Serializable
data class RatingScore(val score: Int, val comment: String? = null)

@Serializable
data class RatingInput(val captain: RatingScore? = null, val merchant: RatingScore? = null)

@Serializable
data class TicketRequester(val id: String = "", val fullName: String = "", val role: String? = null)

@Serializable
data class TicketAuthor(val id: String = "", val fullName: String = "", val isStaff: Boolean = false)

@Serializable
data class TicketMessage(
    val id: String = "",
    val body: String = "",
    val isInternal: Boolean = false,
    val author: TicketAuthor = TicketAuthor(),
    val createdAt: String = "",
)

@Serializable
data class Ticket(
    val id: String = "",
    val number: String = "",
    val subject: String = "",
    val category: String = "",
    val priority: String = "",
    val status: String = "",
    val orderId: String? = null,
    val requester: TicketRequester? = null,
    val assignedTo: String? = null,
    val messages: List<TicketMessage> = emptyList(),
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class NewTicket(
    val subject: String,
    val category: TicketCategory,
    val message: String,
    val orderId: String? = null,
)

@Serializable
data class Notification(
    val id: String = "",
    val type: String = "",
    val title: String = "",
    val body: String = "",
    val data: JsonObject? = null,
    val readAt: String? = null,
    val createdAt: String = "",
)

@Serializable
data class NotificationPage(
    val items: List<Notification> = emptyList(),
    val unread: Int = 0,
    val total: Int = 0,
)

// ─────────────── Captain ───────────────

@Serializable
data class CaptainProfileInput(
    val vehicleType: VehicleType? = null,
    val vehicleMake: String? = null,
    val vehicleModel: String? = null,
    val vehiclePlate: String? = null,
    val vehicleColor: String? = null,
    val nationalIdNumber: String? = null,
    val nationality: String? = null,
    /** yyyy-MM-dd */
    val dateOfBirth: String? = null,
    val bankName: String? = null,
    val iban: String? = null,
    val maxConcurrent: Int? = null,
)

@Serializable
data class CaptainDocument(
    val id: String = "",
    val docType: CaptainDocType = CaptainDocType.UNKNOWN,
    val fileId: String = "",
    val fileUrl: String? = null,
    val number: String? = null,
    val expiresAt: String? = null,
    val status: String = "pending",
    val rejectionReason: String? = null,
    val createdAt: String = "",
)

@Serializable
data class CaptainDocumentInput(
    val docType: CaptainDocType,
    val fileId: String,
    val number: String? = null,
    /** yyyy-MM-dd */
    val expiresAt: String? = null,
)

@Serializable
data class AvailabilitySlot(
    /** 0 = Sunday … 6 = Saturday (local Muscat time). */
    val weekday: Int,
    /** "HH:mm" */
    val start: String,
    val end: String,
)

@Serializable
data class CaptainProfile(
    val id: String = "",
    val userId: String = "",
    val fullName: String = "",
    val phone: String = "",
    val status: CaptainStatus = CaptainStatus.UNKNOWN,
    val rejectionReason: String? = null,
    val vehicleType: VehicleType = VehicleType.UNKNOWN,
    val vehicleMake: String? = null,
    val vehicleModel: String? = null,
    val vehiclePlate: String? = null,
    val vehicleColor: String? = null,
    val nationalIdNumber: String? = null,
    val nationality: String? = null,
    val dateOfBirth: String? = null,
    val bankName: String? = null,
    val iban: String? = null,
    val isOnline: Boolean = false,
    val maxConcurrent: Int = 1,
    val ratingAvg: Double = 0.0,
    val ratingCount: Int = 0,
    val acceptanceRate: Double = 0.0,
    val zoneIds: List<String> = emptyList(),
    val availability: List<AvailabilitySlot> = emptyList(),
    val documents: List<CaptainDocument> = emptyList(),
    val requiredDocuments: List<CaptainDocType> = emptyList(),
    val missingDocuments: List<CaptainDocType> = emptyList(),
) {
    val canGoOnline: Boolean get() = status == CaptainStatus.ACTIVE

    /** Latest uploaded document of each type (a re-upload after rejection supersedes the old one). */
    fun latestDocument(type: CaptainDocType): CaptainDocument? =
        documents.filter { it.docType == type }.maxByOrNull { it.createdAt }
}

@Serializable
data class LocationPing(
    val lat: Double,
    val lng: Double,
    val heading: Double? = null,
    /** metres per second */
    val speed: Double? = null,
    /** metres */
    val accuracy: Double? = null,
)

@Serializable
data class CaptainStatusInput(val online: Boolean, val location: LatLng? = null)

@Serializable
data class Offer(
    val id: String = "",
    val deliveryId: String = "",
    val status: String = "",
    val orderType: OrderType = OrderType.UNKNOWN,
    val expiresAt: String = "",
    val earningBaisa: Long = 0,
    val codAmountBaisa: Long = 0,
    val distanceToPickupM: Int = 0,
    val tripDistanceM: Int = 0,
    val pickupArea: String? = null,
    val dropoffArea: String? = null,
    val pickupLocation: LatLng? = null,
    /** Rounded to ~500 m until accepted. */
    val dropoffLocation: LatLng? = null,
    val merchantName: String? = null,
    val packageSize: String? = null,
    val vehicleType: String? = null,
)

/** `CaptainDelivery` = Delivery + order info + nextActions. */
@Serializable
data class CaptainDelivery(
    val id: String = "",
    val status: DeliveryStatus = DeliveryStatus.UNKNOWN,
    val vehicleType: String? = null,
    val pickup: Place = Place(),
    val dropoff: Place = Place(),
    val packageSize: String? = null,
    val packageDescription: String? = null,
    val distanceM: Int = 0,
    val estimatedDurationS: Int = 0,
    val feeBaisa: Long = 0,
    val codAmountBaisa: Long = 0,
    val pinRequired: Boolean = false,
    val etaPickupAt: String? = null,
    val etaDropoffAt: String? = null,
    val assignedAt: String? = null,
    val pickedUpAt: String? = null,
    val deliveredAt: String? = null,
    val failureReason: String? = null,
    val orderId: String = "",
    val orderNumber: String = "",
    val orderType: OrderType = OrderType.UNKNOWN,
    val orderStatus: OrderStatus = OrderStatus.UNKNOWN,
    val merchantName: String? = null,
    val itemsCount: Int = 0,
    val earningBaisa: Long = 0,
    val nextActions: List<DeliveryAction> = emptyList(),
) {
    /** Before pickup the captain heads to the pickup point, afterwards to the dropoff. */
    val headingToPickup: Boolean get() = status.isBeforePickup
}

@Serializable
data class DeliveryStatusInput(
    val action: DeliveryAction,
    val reason: String? = null,
    val location: LatLng? = null,
)

@Serializable
data class CompleteDeliveryInput(
    val pin: String? = null,
    val photoFileId: String? = null,
    val recipientName: String? = null,
    val codCollectedBaisa: Long? = null,
    val note: String? = null,
    val location: LatLng? = null,
)

@Serializable
data class CaptainDeliveriesPage(val items: List<CaptainDelivery> = emptyList(), val total: Int = 0)

@Serializable
data class LedgerEntry(
    val id: Long = 0,
    val entryType: String = "",
    val amountBaisa: Long = 0,
    val orderId: String? = null,
    val orderNumber: String? = null,
    val description: String = "",
    val settlementId: String? = null,
    val createdAt: String = "",
)

@Serializable
data class Earnings(
    val from: String = "",
    val to: String = "",
    val deliveriesCount: Int = 0,
    /** Sum of captain_earning + tips in period. */
    val earningsBaisa: Long = 0,
    /** Cash collected in period (owed to platform). */
    val codCollectedBaisa: Long = 0,
    /** All-time unsettled balance; positive = platform owes captain, negative = captain owes platform (cash held). */
    val balanceBaisa: Long = 0,
    val entries: List<LedgerEntry> = emptyList(),
)

@Serializable
data class Settlement(
    val id: String = "",
    val accountType: String = "",
    val accountId: String = "",
    val accountName: String = "",
    val periodStart: String = "",
    val periodEnd: String = "",
    val creditsBaisa: Long = 0,
    val debitsBaisa: Long = 0,
    val netBaisa: Long = 0,
    val entryCount: Int = 0,
    val status: String = "",
    val payoutReference: String? = null,
    val createdAt: String = "",
    val paidAt: String? = null,
)

@Serializable
data class DeviceRegistration(val platform: String, val app: String, val token: String)

@Serializable
data class ProfileUpdate(val fullName: String? = null, val locale: String? = null, val email: String? = null)
