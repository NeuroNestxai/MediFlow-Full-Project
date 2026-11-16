import Foundation

// Request bodies. Optional properties are omitted from the JSON when nil
// (synthesized `Encodable` uses `encodeIfPresent`).

public struct OTPRequestInput: Codable, Hashable, Sendable {
    public var phone: String
    public init(phone: String) { self.phone = phone }
}

public struct OTPVerifyInput: Codable, Hashable, Sendable {
    public var phone: String
    public var code: String
    /// Used on first sign-up.
    public var fullName: String?
    public init(phone: String, code: String, fullName: String? = nil) {
        self.phone = phone
        self.code = code
        self.fullName = fullName
    }
}

public struct RefreshInput: Codable, Hashable, Sendable {
    public var refreshToken: String
}

public struct ProfileUpdateInput: Codable, Hashable, Sendable {
    public var fullName: String?
    public var locale: String?
    public var email: String?
    public init(fullName: String? = nil, locale: String? = nil, email: String? = nil) {
        self.fullName = fullName
        self.locale = locale
        self.email = email
    }
}

public struct DeviceRegistrationInput: Codable, Hashable, Sendable {
    public var platform: String
    public var app: ClientApp
    public var token: String
    public init(app: ClientApp, token: String, platform: String = "ios") {
        self.platform = platform
        self.app = app
        self.token = token
    }
}

/// `PlaceInput`.
public struct PlaceInput: Codable, Hashable, Sendable {
    public var location: LatLng
    /// Use a saved address instead of location.
    public var addressId: String?
    public var address: String?
    public var contactName: String?
    public var contactPhone: String?
    public var notes: String?
    public init(location: LatLng, addressId: String? = nil, address: String? = nil,
                contactName: String? = nil, contactPhone: String? = nil, notes: String? = nil) {
        self.location = location
        self.addressId = addressId
        self.address = address
        self.contactName = contactName
        self.contactPhone = contactPhone
        self.notes = notes
    }
}

/// `MarketplaceOrderInput` — body of `POST /orders/quote` and `POST /orders`.
public struct MarketplaceOrderInput: Codable, Hashable, Sendable {
    public struct Item: Codable, Hashable, Sendable {
        public var productId: String
        public var quantity: Int
        public var optionIds: [String]
        public var notes: String?
        public init(productId: String, quantity: Int, optionIds: [String] = [], notes: String? = nil) {
            self.productId = productId
            self.quantity = quantity
            self.optionIds = optionIds
            self.notes = notes
        }
    }

    public var merchantId: String
    public var items: [Item]
    public var addressId: String?
    public var dropoff: PlaceInput?
    /// `online` | `cod`
    public var paymentMethod: PaymentMethod
    public var notes: String?
    public var source: String?

    public init(merchantId: String, items: [Item], addressId: String? = nil, dropoff: PlaceInput? = nil,
                paymentMethod: PaymentMethod, notes: String? = nil, source: String? = "app") {
        self.merchantId = merchantId
        self.items = items
        self.addressId = addressId
        self.dropoff = dropoff
        self.paymentMethod = paymentMethod
        self.notes = notes
        self.source = source
    }
}

public struct DeliveryQuoteInput: Codable, Hashable, Sendable {
    public var type: OrderType
    public var pickup: LatLng
    public var dropoff: LatLng
    public var vehicleType: VehicleType?
    public init(type: OrderType, pickup: LatLng, dropoff: LatLng, vehicleType: VehicleType? = nil) {
        self.type = type
        self.pickup = pickup
        self.dropoff = dropoff
        self.vehicleType = vehicleType
    }
}

/// Body of `POST /shipments` (C2C).
public struct ShipmentInput: Codable, Hashable, Sendable {
    public struct Package: Codable, Hashable, Sendable {
        public var size: PackageSize
        public var description: String
        public var declaredValueBaisa: Int?
        public init(size: PackageSize, description: String, declaredValueBaisa: Int? = nil) {
            self.size = size
            self.description = description
            self.declaredValueBaisa = declaredValueBaisa
        }
    }

    public var pickup: PlaceInput
    public var dropoff: PlaceInput
    public var package: Package
    public var vehicleType: VehicleType?
    public var paymentMethod: PaymentMethod
    /// Required when paymentMethod = cod.
    public var codPayer: CodPayer?
    public var notes: String?

    public init(pickup: PlaceInput, dropoff: PlaceInput, package: Package, vehicleType: VehicleType? = nil,
                paymentMethod: PaymentMethod, codPayer: CodPayer? = nil, notes: String? = nil) {
        self.pickup = pickup
        self.dropoff = dropoff
        self.package = package
        self.vehicleType = vehicleType
        self.paymentMethod = paymentMethod
        self.codPayer = paymentMethod == .cod ? codPayer : nil
        self.notes = notes
    }
}

public struct ReasonInput: Codable, Hashable, Sendable {
    public var reason: String?
    public init(reason: String? = nil) { self.reason = reason }
}

public struct CheckoutInput: Codable, Hashable, Sendable {
    public var returnUrl: String?
    public init(returnUrl: String? = nil) { self.returnUrl = returnUrl }
}

public struct RatingInput: Codable, Hashable, Sendable {
    public struct Score: Codable, Hashable, Sendable {
        public var score: Int
        public var comment: String?
        public init(score: Int, comment: String? = nil) {
            self.score = min(5, max(1, score))
            self.comment = (comment?.isEmpty ?? true) ? nil : comment
        }
    }
    public var captain: Score?
    public var merchant: Score?
    public init(captain: Score? = nil, merchant: Score? = nil) {
        self.captain = captain
        self.merchant = merchant
    }
}

public struct TicketCreateInput: Codable, Hashable, Sendable {
    public var subject: String
    public var category: TicketCategory
    public var orderId: String?
    public var message: String
    public init(subject: String, category: TicketCategory, orderId: String? = nil, message: String) {
        self.subject = subject
        self.category = category
        self.orderId = orderId
        self.message = message
    }
}

public struct TicketReplyInput: Codable, Hashable, Sendable {
    public var body: String
    public init(body: String) { self.body = body }
}

/// `CaptainProfileInput` — `POST /captain/register`, `PATCH /captain/profile`.
public struct CaptainProfileInput: Codable, Hashable, Sendable {
    public var vehicleType: VehicleType?
    public var vehicleMake: String?
    public var vehicleModel: String?
    public var vehiclePlate: String?
    public var vehicleColor: String?
    public var nationalIdNumber: String?
    public var nationality: String?
    /// `YYYY-MM-DD`
    public var dateOfBirth: String?
    public var bankName: String?
    public var iban: String?
    public var maxConcurrent: Int?

    public init(vehicleType: VehicleType? = nil, vehicleMake: String? = nil, vehicleModel: String? = nil,
                vehiclePlate: String? = nil, vehicleColor: String? = nil, nationalIdNumber: String? = nil,
                nationality: String? = nil, dateOfBirth: String? = nil, bankName: String? = nil,
                iban: String? = nil, maxConcurrent: Int? = nil) {
        self.vehicleType = vehicleType
        self.vehicleMake = vehicleMake
        self.vehicleModel = vehicleModel
        self.vehiclePlate = vehiclePlate
        self.vehicleColor = vehicleColor
        self.nationalIdNumber = nationalIdNumber
        self.nationality = nationality
        self.dateOfBirth = dateOfBirth
        self.bankName = bankName
        self.iban = iban
        self.maxConcurrent = maxConcurrent
    }
}

public struct CaptainDocumentInput: Codable, Hashable, Sendable {
    public var docType: CaptainDocType
    public var fileId: String
    public var number: String?
    /// `YYYY-MM-DD`
    public var expiresAt: String?
    public init(docType: CaptainDocType, fileId: String, number: String? = nil, expiresAt: String? = nil) {
        self.docType = docType
        self.fileId = fileId
        self.number = (number?.isEmpty ?? true) ? nil : number
        self.expiresAt = expiresAt
    }
}

public struct ZonesInput: Codable, Hashable, Sendable {
    public var zoneIds: [String]
    public init(zoneIds: [String]) { self.zoneIds = zoneIds }
}

public struct AvailabilityInput: Codable, Hashable, Sendable {
    public var slots: [AvailabilitySlot]
    public init(slots: [AvailabilitySlot]) { self.slots = slots }
}

public struct CaptainStatusInput: Codable, Hashable, Sendable {
    public var online: Bool
    public var location: LatLng?
    public init(online: Bool, location: LatLng? = nil) {
        self.online = online
        self.location = location
    }
}

/// `LocationPing` — `POST /captain/location` and (with `type`) the WebSocket `location` message.
public struct LocationPing: Codable, Hashable, Sendable {
    public var lat: Double
    public var lng: Double
    public var heading: Double?
    /// metres per second
    public var speed: Double?
    /// metres
    public var accuracy: Double?

    public init(lat: Double, lng: Double, heading: Double? = nil, speed: Double? = nil, accuracy: Double? = nil) {
        self.lat = lat
        self.lng = lng
        // CoreLocation reports -1 for "invalid"; the contract has no sentinel, so omit.
        self.heading = (heading ?? -1) >= 0 ? heading : nil
        self.speed = (speed ?? -1) >= 0 ? speed : nil
        self.accuracy = (accuracy ?? -1) >= 0 ? accuracy : nil
    }

    public var latLng: LatLng { LatLng(lat: lat, lng: lng) }
}

public struct DeliveryStatusInput: Codable, Hashable, Sendable {
    public var action: DeliveryAction
    /// Required for fail and release.
    public var reason: String?
    public var location: LatLng?
    public init(action: DeliveryAction, reason: String? = nil, location: LatLng? = nil) {
        self.action = action
        self.reason = reason
        self.location = location
    }
}

public struct DeliveryCompleteInput: Codable, Hashable, Sendable {
    public var pin: String?
    public var photoFileId: String?
    public var recipientName: String?
    public var codCollectedBaisa: Int?
    public var note: String?
    public var location: LatLng?
    public init(pin: String? = nil, photoFileId: String? = nil, recipientName: String? = nil,
                codCollectedBaisa: Int? = nil, note: String? = nil, location: LatLng? = nil) {
        func clean(_ s: String?) -> String? {
            let t = s?.trimmingCharacters(in: .whitespacesAndNewlines)
            return (t?.isEmpty ?? true) ? nil : t
        }
        self.pin = clean(pin)
        self.photoFileId = photoFileId
        self.recipientName = clean(recipientName)
        self.codCollectedBaisa = codCollectedBaisa
        self.note = clean(note)
        self.location = location
    }
}
