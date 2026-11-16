import Foundation

/// `AddressInput` — body of `POST /me/addresses` and `PATCH /me/addresses/{id}`.
public struct AddressInput: Codable, Hashable, Sendable {
    public var label: String?
    public var location: LatLng
    public var area: String?
    public var street: String?
    public var building: String?
    public var floor: String?
    public var apartment: String?
    public var landmark: String?
    public var contactName: String?
    public var contactPhone: String?
    public var isDefault: Bool?

    public init(label: String? = nil, location: LatLng, area: String? = nil, street: String? = nil,
                building: String? = nil, floor: String? = nil, apartment: String? = nil,
                landmark: String? = nil, contactName: String? = nil, contactPhone: String? = nil,
                isDefault: Bool? = nil) {
        self.label = label
        self.location = location
        self.area = area
        self.street = street
        self.building = building
        self.floor = floor
        self.apartment = apartment
        self.landmark = landmark
        self.contactName = contactName
        self.contactPhone = contactPhone
        self.isDefault = isDefault
    }
}

/// `Address` = `AddressInput` + `{id, zoneId, createdAt}`.
public struct Address: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var label: String?
    public var location: LatLng
    public var area: String?
    public var street: String?
    public var building: String?
    public var floor: String?
    public var apartment: String?
    public var landmark: String?
    public var contactName: String?
    public var contactPhone: String?
    public var isDefault: Bool?
    /// Zone covering this address, null if outside service area.
    public var zoneId: String?
    public var createdAt: Date?

    public var isInServiceArea: Bool { zoneId != nil }

    /// One-line human summary ("Building 12, Street 4, Al Khuwair").
    public var summary: String {
        [building.map { $0 }, street, area, landmark]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }

    public var input: AddressInput {
        AddressInput(label: label, location: location, area: area, street: street, building: building,
                     floor: floor, apartment: apartment, landmark: landmark, contactName: contactName,
                     contactPhone: contactPhone, isDefault: isDefault)
    }
}

/// `Notification` (named `AppNotification` to avoid clashing with `Foundation.Notification`).
public struct AppNotification: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    @DefaultEmptyString public var type: String
    @DefaultEmptyString public var title: String
    @DefaultEmptyString public var body: String
    public var data: JSONValue?
    public var readAt: Date?
    public var createdAt: Date?

    public var isRead: Bool { readAt != nil }

    /// Order referenced by the notification payload, if any.
    public var orderId: String? { data?["orderId"]?.stringValue }
}

/// `NotificationPage`.
public struct NotificationPage: Codable, Hashable, Sendable {
    @DefaultEmpty public var items: [AppNotification]
    @DefaultZero public var unread: Int
    public var total: Int?
}

public struct TicketAuthor: Codable, Hashable, Sendable {
    public var id: String?
    @DefaultEmptyString public var fullName: String
    @DefaultFalse public var isStaff: Bool
}

public struct TicketMessage: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    @DefaultEmptyString public var body: String
    @DefaultFalse public var isInternal: Bool
    public var author: TicketAuthor?
    public var createdAt: Date?
}

public struct TicketRequester: Codable, Hashable, Sendable {
    public var id: String?
    @DefaultEmptyString public var fullName: String
    public var role: String?
}

/// `Ticket`.
public struct Ticket: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    @DefaultEmptyString public var number: String
    @DefaultEmptyString public var subject: String
    public var category: TicketCategory?
    public var priority: String?
    @DefaultEmptyString public var status: String
    public var orderId: String?
    public var requester: TicketRequester?
    public var assignedTo: String?
    @DefaultEmpty public var messages: [TicketMessage]
    public var createdAt: Date?
    public var updatedAt: Date?

    public var isClosed: Bool { ["closed", "resolved"].contains(status) }
}
