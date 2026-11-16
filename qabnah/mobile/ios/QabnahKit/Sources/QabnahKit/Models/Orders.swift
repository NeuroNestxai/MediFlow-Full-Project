import Foundation

/// `Place` (read model of a pickup / dropoff).
public struct Place: Codable, Hashable, Sendable {
    public var location: LatLng?
    public var address: String?
    public var contactName: String?
    /// Masked or hidden depending on viewer and delivery state.
    public var contactPhone: String?
    public var notes: String?
}

public struct CaptainLocation: Codable, Hashable, Sendable {
    public var lat: Double
    public var lng: Double
    public var heading: Double?
    public var updatedAt: Date?

    public var latLng: LatLng { LatLng(lat: lat, lng: lng) }
}

/// `CaptainPublic` — what a customer sees about their captain.
public struct CaptainPublic: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    @DefaultEmptyString public var firstName: String
    public var vehicleType: VehicleType?
    public var vehiclePlate: String?
    public var vehicleColor: String?
    public var vehicleModel: String?
    public var ratingAvg: Double?
    /// Only while delivery is active.
    public var phone: String?
    public var location: CaptainLocation?
}

/// `Delivery`.
public struct Delivery: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var status: DeliveryStatus
    public var vehicleType: String?
    public var pickup: Place?
    public var dropoff: Place?
    public var packageSize: String?
    public var packageDescription: String?
    @DefaultZero public var distanceM: Int
    @DefaultZero public var estimatedDurationS: Int
    @DefaultZero public var feeBaisa: Int
    @DefaultZero public var codAmountBaisa: Int
    /// Shown to the customer/sender/merchant only, never to the captain.
    public var deliveryPin: String?
    @DefaultFalse public var pinRequired: Bool
    public var captain: CaptainPublic?
    public var etaPickupAt: Date?
    public var etaDropoffAt: Date?
    public var assignedAt: Date?
    public var pickedUpAt: Date?
    public var deliveredAt: Date?
    public var failureReason: String?
}

public struct OrderMerchantRef: Codable, Hashable, Identifiable, Sendable, BilingualNamed {
    public var id: String
    @DefaultEmptyString public var slug: String
    @DefaultEmptyString public var nameEn: String
    @DefaultEmptyString public var nameAr: String
    public var logoUrl: String?
    public var contactPhone: String?
}

public struct OrderItemOption: Codable, Hashable, Sendable, BilingualNamed {
    public var groupNameEn: String?
    @DefaultEmptyString public var nameEn: String
    @DefaultEmptyString public var nameAr: String
    @DefaultZero public var priceDeltaBaisa: Int
}

public struct OrderItem: Codable, Hashable, Identifiable, Sendable, BilingualNamed {
    public var id: String
    public var productId: String?
    @DefaultEmptyString public var nameEn: String
    @DefaultEmptyString public var nameAr: String
    @DefaultZero public var unitPriceBaisa: Int
    @DefaultZero public var quantity: Int
    @DefaultEmpty public var options: [OrderItemOption]
    @DefaultZero public var lineTotalBaisa: Int
    public var notes: String?
}

public struct TimelineEntry: Codable, Hashable, Identifiable, Sendable {
    public var status: String
    public var at: Date
    public var note: String?
    public var id: String { "\(status)-\(at.timeIntervalSince1970)" }
}

/// `Order`.
public struct Order: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    @DefaultEmptyString public var number: String
    public var type: OrderType
    public var source: String?
    public var status: OrderStatus
    public var paymentMethod: PaymentMethod
    @DefaultEmptyString public var paymentStatus: String
    public var codPayer: String?
    public var merchant: OrderMerchantRef?
    public var customerName: String?
    public var customerPhone: String?
    @DefaultEmpty public var items: [OrderItem]
    @DefaultZero public var subtotalBaisa: Int
    @DefaultZero public var deliveryFeeBaisa: Int
    @DefaultZero public var serviceFeeBaisa: Int
    @DefaultZero public var discountBaisa: Int
    @DefaultZero public var vatBaisa: Int
    @DefaultZero public var totalBaisa: Int
    @DefaultZero public var codAmountBaisa: Int
    public var currency: String?
    public var notes: String?
    public var prepTimeMinutes: Int?
    public var cancelReason: String?
    public var createdAt: Date
    public var placedAt: Date?
    public var acceptedAt: Date?
    public var readyAt: Date?
    public var deliveredAt: Date?
    public var cancelledAt: Date?
    public var delivery: Delivery?
    @DefaultEmpty public var timeline: [TimelineEntry]
    @DefaultFalse public var rated: Bool

    /// Client-side hint mirroring the contract wording for `POST /orders/{id}/cancel`:
    /// "allowed before the merchant accepts / before pickup for C2C". The server is
    /// authoritative and answers 409 otherwise.
    public var isCancellable: Bool {
        switch status {
        case .pendingPayment, .placed:
            return true
        case .accepted, .preparing, .readyForPickup:
            guard type != .marketplace else { return false }
            return delivery?.status.isBeforePickup ?? true
        default:
            return false
        }
    }

    public var canRate: Bool { status.isDeliveredLike && !rated }

    /// Live tracking is meaningful once a delivery exists and the order is not final.
    public var isTrackable: Bool {
        guard let d = delivery else { return false }
        return !status.isFinal && d.status != .cancelled
    }

    public var awaitingOnlinePayment: Bool {
        status == .pendingPayment && paymentMethod == .online
    }
}

/// `Tracking` — `GET /orders/{id}/tracking`.
public struct Tracking: Codable, Hashable, Sendable {
    public var orderId: String
    public var orderStatus: OrderStatus
    public var deliveryStatus: DeliveryStatus?
    public var pickup: LatLng?
    public var dropoff: LatLng?
    public var captain: CaptainPublic?
    public var etaPickupAt: Date?
    public var etaDropoffAt: Date?
    /// Recent breadcrumbs (max 200).
    @DefaultEmpty public var path: [LatLng]
}

/// `PriceBreakdown` — `POST /orders/quote`.
public struct PriceBreakdown: Codable, Hashable, Sendable {
    @DefaultZero public var subtotalBaisa: Int
    @DefaultZero public var deliveryFeeBaisa: Int
    @DefaultZero public var serviceFeeBaisa: Int
    @DefaultZero public var discountBaisa: Int
    /// VAT included in or added to the total.
    @DefaultZero public var vatBaisa: Int
    @DefaultFalse public var vatIncluded: Bool
    @DefaultZero public var totalBaisa: Int
    public var distanceM: Int?
    public var estimatedDurationS: Int?
    public var currency: String?
    @DefaultEmpty public var lines: [PriceLine]

    public struct PriceLine: Codable, Hashable, Sendable, BilingualNamed {
        public var productId: String?
        @DefaultEmptyString public var nameEn: String
        @DefaultEmptyString public var nameAr: String
        @DefaultZero public var quantity: Int
        @DefaultZero public var unitPriceBaisa: Int
        @DefaultZero public var lineTotalBaisa: Int
        /// Shape not specified by the contract (`type: object`).
        @DefaultEmpty public var options: [JSONValue]
    }
}

/// `DeliveryQuote` — `POST /quotes/delivery`.
public struct DeliveryQuote: Codable, Hashable, Sendable {
    @DefaultZero public var feeBaisa: Int
    @DefaultZero public var distanceM: Int
    @DefaultZero public var estimatedDurationS: Int
    public var zoneId: String?
    public var vehicleType: String?
    public var currency: String?
}

/// `Checkout` — `POST /orders/{id}/checkout`.
public struct Checkout: Codable, Hashable, Sendable {
    public var paymentId: String?
    public var provider: String?
    public var checkoutUrl: String
    public var status: String?
}
