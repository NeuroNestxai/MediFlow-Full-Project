import Foundation

/// Server → client WebSocket messages (`info.description` of the contract).
public enum RealtimeInbound: Equatable, Sendable {
    case subscribed(channel: String)
    case error(code: String, channel: String?, message: String?)
    case event(RealtimeEvent)
    case pong
    case unknown(type: String)

    private struct Raw: Decodable {
        var type: String
        var channel: String?
        var code: String?
        var message: String?
        var event: String?
        var data: JSONValue?
        var id: Int?
    }

    public static func decode(_ data: Data) throws -> RealtimeInbound {
        let raw = try JSONDecoder.qabnah.decode(Raw.self, from: data)
        switch raw.type {
        case "subscribed": return .subscribed(channel: raw.channel ?? "")
        case "error": return .error(code: raw.code ?? "error", channel: raw.channel, message: raw.message)
        case "pong": return .pong
        case "event":
            return .event(RealtimeEvent(channel: raw.channel ?? "", name: raw.event ?? "", data: raw.data ?? .null, id: raw.id))
        default: return .unknown(type: raw.type)
        }
    }
}

/// `{"type":"event","channel":"order:<id>","event":"order.status_changed","data":{…},"id":123}`
public struct RealtimeEvent: Equatable, Sendable {
    public var channel: String
    /// e.g. `order.status_changed`, `delivery.location`, `offer.created`
    public var name: String
    public var data: JSONValue
    public var id: Int?

    public init(channel: String, name: String, data: JSONValue, id: Int? = nil) {
        self.channel = channel
        self.name = name
        self.data = data
        self.id = id
    }

    public func decodeData<T: Decodable>(_ type: T.Type) throws -> T {
        try data.decode(T.self)
    }
}

/// Event names used by the apps.
public enum RealtimeEventName {
    public static let orderCreated = "order.created"
    public static let orderStatusChanged = "order.status_changed"
    public static let deliveryStatusChanged = "delivery.status_changed"
    public static let deliveryAssigned = "delivery.assigned"
    public static let deliveryLocation = "delivery.location"
    public static let offerCreated = "offer.created"
    public static let offerExpired = "offer.expired"
    public static let offerCancelled = "offer.cancelled"
    public static let notificationCreated = "notification.created"
}

public enum RealtimeChannel {
    public static func order(_ id: String) -> String { "order:\(id)" }
    public static func delivery(_ id: String) -> String { "delivery:\(id)" }
    public static let captainMe = "captain:me"
    public static let userMe = "user:me"
}

/// `delivery.location` payload: `{lat, lng, heading, etaDropoffAt}`.
public struct DeliveryLocationEventData: Codable, Hashable, Sendable {
    public var lat: Double
    public var lng: Double
    public var heading: Double?
    public var etaDropoffAt: Date?
    public var latLng: LatLng { LatLng(lat: lat, lng: lng) }
}

/// Client → server messages.
public enum RealtimeOutbound: Equatable, Sendable {
    case subscribe(String)
    case unsubscribe(String)
    case location(LocationPing)
    case ping

    public func encoded() throws -> Data {
        let obj: [String: JSONValue]
        switch self {
        case .subscribe(let ch): obj = ["type": .string("subscribe"), "channel": .string(ch)]
        case .unsubscribe(let ch): obj = ["type": .string("unsubscribe"), "channel": .string(ch)]
        case .ping: obj = ["type": .string("ping")]
        case .location(let p):
            var o: [String: JSONValue] = ["type": .string("location"), "lat": .number(p.lat), "lng": .number(p.lng)]
            if let h = p.heading { o["heading"] = .number(h) }
            if let s = p.speed { o["speed"] = .number(s) }
            if let a = p.accuracy { o["accuracy"] = .number(a) }
            obj = o
        }
        return try JSONEncoder.qabnah.encode(obj)
    }
}
