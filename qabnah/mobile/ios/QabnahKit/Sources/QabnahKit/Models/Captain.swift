import Foundation

public struct CaptainDocument: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var docType: CaptainDocType
    public var fileId: String?
    public var fileUrl: String?
    public var number: String?
    /// `format: date` (YYYY-MM-DD), kept as a string.
    public var expiresAt: String?
    public var status: DocumentStatus
    public var rejectionReason: String?
    public var createdAt: Date?
}

/// `AvailabilitySlot` — local Muscat time.
public struct AvailabilitySlot: Codable, Hashable, Sendable, Identifiable {
    /// 0 = Sunday.
    public var weekday: Int
    /// `HH:mm`
    public var start: String
    /// `HH:mm`
    public var end: String

    public init(weekday: Int, start: String, end: String) {
        self.weekday = weekday
        self.start = start
        self.end = end
    }

    public var id: String { "\(weekday)-\(start)-\(end)" }

    /// Minutes since midnight for `HH:mm`, nil if malformed.
    public static func minutes(_ hhmm: String) -> Int? {
        let parts = hhmm.split(separator: ":")
        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]),
              (0...24).contains(h), (0..<60).contains(m), h * 60 + m <= 24 * 60 else { return nil }
        return h * 60 + m
    }

    public static func hhmm(_ minutes: Int) -> String {
        String(format: "%02d:%02d", minutes / 60, minutes % 60)
    }

    public var isValid: Bool {
        guard (0...6).contains(weekday),
              let s = Self.minutes(start), let e = Self.minutes(end) else { return false }
        return e > s
    }
}

/// `CaptainProfile`.
public struct CaptainProfile: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var userId: String?
    @DefaultEmptyString public var fullName: String
    @DefaultEmptyString public var phone: String
    public var status: CaptainStatus
    public var rejectionReason: String?
    public var vehicleType: VehicleType?
    public var vehicleMake: String?
    public var vehicleModel: String?
    public var vehiclePlate: String?
    public var vehicleColor: String?
    public var nationalIdNumber: String?
    public var nationality: String?
    public var dateOfBirth: String?
    public var bankName: String?
    public var iban: String?
    @DefaultFalse public var isOnline: Bool
    public var maxConcurrent: Int?
    @DefaultZeroDouble public var ratingAvg: Double
    @DefaultZero public var ratingCount: Int
    @DefaultZeroDouble public var acceptanceRate: Double
    @DefaultEmpty public var zoneIds: [String]
    @DefaultEmpty public var availability: [AvailabilitySlot]
    @DefaultEmpty public var documents: [CaptainDocument]
    @DefaultEmpty public var requiredDocuments: [CaptainDocType]
    @DefaultEmpty public var missingDocuments: [CaptainDocType]

    public var canGoOnline: Bool { status == .active }

    /// Latest document of a type (re-uploads create new rows).
    public func document(for type: CaptainDocType) -> CaptainDocument? {
        documents
            .filter { $0.docType == type }
            .max { ($0.createdAt ?? .distantPast) < ($1.createdAt ?? .distantPast) }
    }

    /// Checklist rows: every required document with its latest upload (if any).
    public var documentChecklist: [DocumentChecklistItem] {
        requiredDocuments.map { type in
            DocumentChecklistItem(type: type, document: document(for: type), missing: missingDocuments.contains(type))
        }
    }
}

public struct DocumentChecklistItem: Hashable, Identifiable, Sendable {
    public var type: CaptainDocType
    /// Latest upload of this type, if any.
    public var document: CaptainDocument?
    /// Listed in `missingDocuments` by the server.
    public var missing: Bool
    public var id: String { type.rawValue }
}

/// `Offer` — `GET /captain/offers`, realtime `offer.created`.
public struct Offer: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var deliveryId: String?
    public var status: String?
    public var orderType: OrderType?
    public var expiresAt: Date
    @DefaultZero public var earningBaisa: Int
    @DefaultZero public var codAmountBaisa: Int
    @DefaultZero public var distanceToPickupM: Int
    @DefaultZero public var tripDistanceM: Int
    @DefaultEmptyString public var pickupArea: String
    @DefaultEmptyString public var dropoffArea: String
    public var pickupLocation: LatLng?
    /// Rounded to ~500 m until accepted.
    public var dropoffLocation: LatLng?
    public var merchantName: String?
    public var packageSize: String?
    public var vehicleType: String?

    public func secondsRemaining(now: Date = Date()) -> Int {
        max(0, Int(expiresAt.timeIntervalSince(now).rounded(.down)))
    }

    public func isExpired(now: Date = Date()) -> Bool { expiresAt <= now }
}

/// `CaptainDelivery` = `Delivery` + order context and `nextActions`.
@dynamicMemberLookup
public struct CaptainDelivery: Codable, Hashable, Identifiable, Sendable {
    public var delivery: Delivery
    public var orderId: String?
    public var orderNumber: String?
    public var orderType: OrderType?
    public var orderStatus: OrderStatus?
    public var merchantName: String?
    public var itemsCount: Int?
    public var earningBaisa: Int
    public var nextActions: [DeliveryAction]

    public var id: String { delivery.id }

    private enum ExtraKeys: String, CodingKey {
        case orderId, orderNumber, orderType, orderStatus, merchantName, itemsCount, earningBaisa, nextActions
    }

    public init(from decoder: Decoder) throws {
        delivery = try Delivery(from: decoder)
        let c = try decoder.container(keyedBy: ExtraKeys.self)
        orderId = try c.decodeIfPresent(String.self, forKey: .orderId)
        orderNumber = try c.decodeIfPresent(String.self, forKey: .orderNumber)
        orderType = try c.decodeIfPresent(OrderType.self, forKey: .orderType)
        orderStatus = try c.decodeIfPresent(OrderStatus.self, forKey: .orderStatus)
        merchantName = try c.decodeIfPresent(String.self, forKey: .merchantName)
        itemsCount = try c.decodeIfPresent(Int.self, forKey: .itemsCount)
        earningBaisa = try c.decodeIfPresent(Int.self, forKey: .earningBaisa) ?? 0
        nextActions = try c.decodeIfPresent([DeliveryAction].self, forKey: .nextActions) ?? []
    }

    public func encode(to encoder: Encoder) throws {
        try delivery.encode(to: encoder)
        var c = encoder.container(keyedBy: ExtraKeys.self)
        try c.encodeIfPresent(orderId, forKey: .orderId)
        try c.encodeIfPresent(orderNumber, forKey: .orderNumber)
        try c.encodeIfPresent(orderType, forKey: .orderType)
        try c.encodeIfPresent(orderStatus, forKey: .orderStatus)
        try c.encodeIfPresent(merchantName, forKey: .merchantName)
        try c.encodeIfPresent(itemsCount, forKey: .itemsCount)
        try c.encode(earningBaisa, forKey: .earningBaisa)
        try c.encode(nextActions, forKey: .nextActions)
    }

    public subscript<T>(dynamicMember keyPath: KeyPath<Delivery, T>) -> T {
        delivery[keyPath: keyPath]
    }

    /// Step actions shown as buttons (complete/fail/release are handled separately in UI).
    public var stepActions: [DeliveryAction] {
        nextActions.filter { [.arrivePickup, .pickup, .arriveDropoff].contains($0) }
    }

    /// Where the captain is heading next: pickup until picked up, then dropoff.
    public var currentTarget: Place? {
        delivery.status.isBeforePickup ? delivery.pickup : delivery.dropoff
    }

    public var isActive: Bool {
        switch delivery.status {
        case .assigned, .atPickup, .pickedUp, .atDropoff, .returning: return true
        default: return false
        }
    }
}

public struct LedgerEntry: Codable, Hashable, Identifiable, Sendable {
    public var id: Int
    @DefaultEmptyString public var entryType: String
    @DefaultZero public var amountBaisa: Int
    public var orderId: String?
    public var orderNumber: String?
    @DefaultEmptyString public var description: String
    public var settlementId: String?
    public var createdAt: Date?
}

/// `Earnings` — `GET /captain/earnings`.
public struct Earnings: Codable, Hashable, Sendable {
    public var from: String?
    public var to: String?
    @DefaultZero public var deliveriesCount: Int
    /// Sum of captain_earning + tips in period.
    @DefaultZero public var earningsBaisa: Int
    /// Cash collected in period (owed to platform).
    @DefaultZero public var codCollectedBaisa: Int
    /// All-time unsettled balance; positive = platform owes captain, negative = captain owes platform.
    @DefaultZero public var balanceBaisa: Int
    @DefaultEmpty public var entries: [LedgerEntry]

    public enum BalanceDirection: Equatable, Sendable {
        case platformOwesCaptain(Int)
        case captainOwesPlatform(Int)
        case settled
    }

    public var balanceDirection: BalanceDirection {
        if balanceBaisa > 0 { return .platformOwesCaptain(balanceBaisa) }
        if balanceBaisa < 0 { return .captainOwesPlatform(-balanceBaisa) }
        return .settled
    }
}

/// `Settlement` — `GET /captain/payouts`.
public struct Settlement: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var accountType: String?
    public var accountId: String?
    public var accountName: String?
    public var periodStart: String?
    public var periodEnd: String?
    @DefaultZero public var creditsBaisa: Int
    @DefaultZero public var debitsBaisa: Int
    @DefaultZero public var netBaisa: Int
    @DefaultZero public var entryCount: Int
    @DefaultEmptyString public var status: String
    public var payoutReference: String?
    public var createdAt: Date?
    public var paidAt: String?
}
