import Foundation

// Enums mirror `components.schemas.*` in API_CONTRACT.yaml. Every enum has an `unknown`
// sentinel so a newer server never breaks decoding of an older app.

public enum OrderType: String, LenientStringEnum {
    case marketplace
    case merchantDelivery = "merchant_delivery"
    case c2c
    case unknown
    public static var unknownCase: OrderType { .unknown }
}

public enum VehicleType: String, LenientStringEnum {
    case bike, car, van, unknown
    public static var unknownCase: VehicleType { .unknown }
}

public enum MerchantCategory: String, LenientStringEnum {
    case restaurant, cafe, grocery, pharmacy, retail, flowers, electronics, other, unknown
    public static var unknownCase: MerchantCategory { .unknown }
}

public enum OrderStatus: String, LenientStringEnum {
    case pendingPayment = "pending_payment"
    case placed
    case accepted
    case preparing
    case readyForPickup = "ready_for_pickup"
    case outForDelivery = "out_for_delivery"
    case delivered
    case completed
    case rejected
    case cancelled
    case unknown
    public static var unknownCase: OrderStatus { .unknown }

    /// Terminal states (no further changes expected).
    public var isFinal: Bool {
        switch self {
        case .completed, .rejected, .cancelled: return true
        // `delivered` is final for the customer even though it later moves to `completed`.
        case .delivered: return true
        default: return false
        }
    }

    public var isDeliveredLike: Bool { self == .delivered || self == .completed }
}

public enum DeliveryStatus: String, LenientStringEnum {
    case created, searching, unassigned, assigned
    case atPickup = "at_pickup"
    case pickedUp = "picked_up"
    case atDropoff = "at_dropoff"
    case delivered, failed, returning, returned, cancelled
    case unknown
    public static var unknownCase: DeliveryStatus { .unknown }

    /// A captain is attached and the job is in progress (live location is meaningful).
    public var hasActiveCaptain: Bool {
        switch self {
        case .assigned, .atPickup, .pickedUp, .atDropoff, .returning: return true
        default: return false
        }
    }

    public var isBeforePickup: Bool {
        switch self {
        case .created, .searching, .unassigned, .assigned, .atPickup: return true
        default: return false
        }
    }
}

public enum CaptainDocType: String, LenientStringEnum {
    case nationalId = "national_id"
    case drivingLicense = "driving_license"
    case vehicleRegistration = "vehicle_registration"
    case vehicleInsurance = "vehicle_insurance"
    case profilePhoto = "profile_photo"
    case policeClearance = "police_clearance"
    case unknown
    public static var unknownCase: CaptainDocType { .unknown }
}

public enum CaptainStatus: String, LenientStringEnum {
    case pendingDocuments = "pending_documents"
    case pendingReview = "pending_review"
    case active, suspended, rejected, unknown
    public static var unknownCase: CaptainStatus { .unknown }
}

public enum DocumentStatus: String, LenientStringEnum {
    case pending, approved, rejected, unknown
    public static var unknownCase: DocumentStatus { .unknown }
}

/// `Order.paymentMethod` (`online`, `cod`, `prepaid`). Inputs only accept `online`/`cod`.
public enum PaymentMethod: String, LenientStringEnum {
    case online, cod, prepaid, unknown
    public static var unknownCase: PaymentMethod { .unknown }
}

public enum CodPayer: String, LenientStringEnum {
    case sender, recipient, unknown
    public static var unknownCase: CodPayer { .unknown }
}

public enum PackageSize: String, LenientStringEnum {
    case small, medium, large, unknown
    public static var unknownCase: PackageSize { .unknown }
}

public enum OptionGroupKind: String, LenientStringEnum {
    case variant, addon, unknown
    public static var unknownCase: OptionGroupKind { .unknown }
}

/// `CaptainDelivery.nextActions` items and `/captain/deliveries/{id}/status` actions.
public enum DeliveryAction: String, LenientStringEnum {
    case arrivePickup = "arrive_pickup"
    case pickup
    case arriveDropoff = "arrive_dropoff"
    case complete
    case fail
    case release
    case unknown
    public static var unknownCase: DeliveryAction { .unknown }

    /// `complete` has its own endpoint; `fail`/`release` need a reason.
    public var requiresReason: Bool { self == .fail || self == .release }
}

public enum TicketCategory: String, LenientStringEnum {
    case orderIssue = "order_issue"
    case payment, delivery, captain, merchant, account, other, unknown
    public static var unknownCase: TicketCategory { .unknown }
}

public enum FilePurpose: String, LenientStringEnum {
    case captainDocument = "captain_document"
    case merchantDocument = "merchant_document"
    case productImage = "product_image"
    case branding
    case proofOfDelivery = "proof_of_delivery"
    case supportAttachment = "support_attachment"
    case other
    case unknown
    public static var unknownCase: FilePurpose { .unknown }
}

/// `POST /me/devices` `app` field.
public enum ClientApp: String, Codable, Sendable {
    case consumer, captain, merchant, admin
}
