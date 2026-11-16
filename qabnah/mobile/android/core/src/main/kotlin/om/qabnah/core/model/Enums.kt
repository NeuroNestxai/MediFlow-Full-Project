package om.qabnah.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/** Enum with a wire value. Unknown wire values decode to the enum's `UNKNOWN` entry instead of failing. */
interface WireEnum {
    val wire: String
}

/**
 * Lenient enum serializer: the server may add enum values in a minor version; old app builds must keep working.
 * Encodes [WireEnum.wire]; decodes unknown strings to [fallback].
 */
open class WireEnumSerializer<T>(
    serialName: String,
    private val values: Array<T>,
    private val fallback: T,
) : KSerializer<T> where T : Enum<T>, T : WireEnum {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor(serialName, PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: T) = encoder.encodeString(value.wire)
    override fun deserialize(decoder: Decoder): T {
        val raw = decoder.decodeString()
        return values.firstOrNull { it.wire == raw } ?: fallback
    }
}

@Serializable(with = OrderStatus.Serializer::class)
enum class OrderStatus(override val wire: String) : WireEnum {
    PENDING_PAYMENT("pending_payment"), PLACED("placed"), ACCEPTED("accepted"), PREPARING("preparing"),
    READY_FOR_PICKUP("ready_for_pickup"), OUT_FOR_DELIVERY("out_for_delivery"), DELIVERED("delivered"),
    COMPLETED("completed"), REJECTED("rejected"), CANCELLED("cancelled"), UNKNOWN("unknown");

    val isTerminal: Boolean get() = this == DELIVERED || this == COMPLETED || this == REJECTED || this == CANCELLED

    object Serializer : WireEnumSerializer<OrderStatus>("OrderStatus", OrderStatus.entries.toTypedArray(), OrderStatus.UNKNOWN)
}

@Serializable(with = DeliveryStatus.Serializer::class)
enum class DeliveryStatus(override val wire: String) : WireEnum {
    CREATED("created"), SEARCHING("searching"), UNASSIGNED("unassigned"), ASSIGNED("assigned"),
    AT_PICKUP("at_pickup"), PICKED_UP("picked_up"), AT_DROPOFF("at_dropoff"), DELIVERED("delivered"),
    FAILED("failed"), RETURNING("returning"), RETURNED("returned"), CANCELLED("cancelled"), UNKNOWN("unknown");

    /** Captain is on the way / carrying the parcel: the consumer may see the live captain location. */
    val isTrackable: Boolean get() = this == ASSIGNED || this == AT_PICKUP || this == PICKED_UP || this == AT_DROPOFF
    val isBeforePickup: Boolean
        get() = this == CREATED || this == SEARCHING || this == UNASSIGNED || this == ASSIGNED || this == AT_PICKUP

    object Serializer : WireEnumSerializer<DeliveryStatus>("DeliveryStatus", DeliveryStatus.entries.toTypedArray(), DeliveryStatus.UNKNOWN)
}

@Serializable(with = OrderType.Serializer::class)
enum class OrderType(override val wire: String) : WireEnum {
    MARKETPLACE("marketplace"), MERCHANT_DELIVERY("merchant_delivery"), C2C("c2c"), UNKNOWN("unknown");

    object Serializer : WireEnumSerializer<OrderType>("OrderType", OrderType.entries.toTypedArray(), OrderType.UNKNOWN)
}

@Serializable(with = VehicleType.Serializer::class)
enum class VehicleType(override val wire: String) : WireEnum {
    BIKE("bike"), CAR("car"), VAN("van"), UNKNOWN("unknown");

    object Serializer : WireEnumSerializer<VehicleType>("VehicleType", VehicleType.entries.toTypedArray(), VehicleType.UNKNOWN)

    companion object {
        val selectable = listOf(BIKE, CAR, VAN)
    }
}

@Serializable(with = MerchantCategory.Serializer::class)
enum class MerchantCategory(override val wire: String) : WireEnum {
    RESTAURANT("restaurant"), CAFE("cafe"), GROCERY("grocery"), PHARMACY("pharmacy"), RETAIL("retail"),
    FLOWERS("flowers"), ELECTRONICS("electronics"), OTHER("other"), UNKNOWN("unknown");

    object Serializer : WireEnumSerializer<MerchantCategory>("MerchantCategory", MerchantCategory.entries.toTypedArray(), MerchantCategory.UNKNOWN)

    companion object {
        val browsable = entries.filter { it != UNKNOWN }
    }
}

@Serializable(with = CaptainDocType.Serializer::class)
enum class CaptainDocType(override val wire: String) : WireEnum {
    NATIONAL_ID("national_id"), DRIVING_LICENSE("driving_license"), VEHICLE_REGISTRATION("vehicle_registration"),
    VEHICLE_INSURANCE("vehicle_insurance"), PROFILE_PHOTO("profile_photo"), POLICE_CLEARANCE("police_clearance"),
    UNKNOWN("unknown");

    object Serializer : WireEnumSerializer<CaptainDocType>("CaptainDocType", CaptainDocType.entries.toTypedArray(), CaptainDocType.UNKNOWN)
}

@Serializable(with = CaptainStatus.Serializer::class)
enum class CaptainStatus(override val wire: String) : WireEnum {
    PENDING_DOCUMENTS("pending_documents"), PENDING_REVIEW("pending_review"), ACTIVE("active"),
    SUSPENDED("suspended"), REJECTED("rejected"), UNKNOWN("unknown");

    object Serializer : WireEnumSerializer<CaptainStatus>("CaptainStatus", CaptainStatus.entries.toTypedArray(), CaptainStatus.UNKNOWN)
}

@Serializable(with = DeliveryAction.Serializer::class)
enum class DeliveryAction(override val wire: String) : WireEnum {
    ARRIVE_PICKUP("arrive_pickup"), PICKUP("pickup"), ARRIVE_DROPOFF("arrive_dropoff"), COMPLETE("complete"),
    FAIL("fail"), RELEASE("release"), UNKNOWN("unknown");

    /** `fail` and `release` need a reason (contract: "Required for fail and release"). */
    val requiresReason: Boolean get() = this == FAIL || this == RELEASE

    object Serializer : WireEnumSerializer<DeliveryAction>("DeliveryAction", DeliveryAction.entries.toTypedArray(), DeliveryAction.UNKNOWN)
}

@Serializable(with = PaymentMethod.Serializer::class)
enum class PaymentMethod(override val wire: String) : WireEnum {
    ONLINE("online"), COD("cod"), PREPAID("prepaid"), UNKNOWN("unknown");

    object Serializer : WireEnumSerializer<PaymentMethod>("PaymentMethod", PaymentMethod.entries.toTypedArray(), PaymentMethod.UNKNOWN)
}

@Serializable(with = CodPayer.Serializer::class)
enum class CodPayer(override val wire: String) : WireEnum {
    SENDER("sender"), RECIPIENT("recipient"), UNKNOWN("unknown");

    object Serializer : WireEnumSerializer<CodPayer>("CodPayer", CodPayer.entries.toTypedArray(), CodPayer.UNKNOWN)
}

@Serializable(with = PackageSize.Serializer::class)
enum class PackageSize(override val wire: String) : WireEnum {
    SMALL("small"), MEDIUM("medium"), LARGE("large"), UNKNOWN("unknown");

    object Serializer : WireEnumSerializer<PackageSize>("PackageSize", PackageSize.entries.toTypedArray(), PackageSize.UNKNOWN)

    companion object {
        val selectable = listOf(SMALL, MEDIUM, LARGE)
    }
}

@Serializable(with = OptionGroupKind.Serializer::class)
enum class OptionGroupKind(override val wire: String) : WireEnum {
    VARIANT("variant"), ADDON("addon"), UNKNOWN("unknown");

    object Serializer : WireEnumSerializer<OptionGroupKind>("OptionGroupKind", OptionGroupKind.entries.toTypedArray(), OptionGroupKind.UNKNOWN)
}

@Serializable(with = FilePurpose.Serializer::class)
enum class FilePurpose(override val wire: String) : WireEnum {
    CAPTAIN_DOCUMENT("captain_document"), MERCHANT_DOCUMENT("merchant_document"), PRODUCT_IMAGE("product_image"),
    BRANDING("branding"), PROOF_OF_DELIVERY("proof_of_delivery"), SUPPORT_ATTACHMENT("support_attachment"),
    OTHER("other"), UNKNOWN("unknown");

    object Serializer : WireEnumSerializer<FilePurpose>("FilePurpose", FilePurpose.entries.toTypedArray(), FilePurpose.UNKNOWN)
}

@Serializable(with = TicketCategory.Serializer::class)
enum class TicketCategory(override val wire: String) : WireEnum {
    ORDER_ISSUE("order_issue"), PAYMENT("payment"), DELIVERY("delivery"), CAPTAIN("captain"),
    MERCHANT("merchant"), ACCOUNT("account"), OTHER("other"), UNKNOWN("unknown");

    object Serializer : WireEnumSerializer<TicketCategory>("TicketCategory", TicketCategory.entries.toTypedArray(), TicketCategory.UNKNOWN)

    companion object {
        val selectable = entries.filter { it != UNKNOWN }
    }
}
