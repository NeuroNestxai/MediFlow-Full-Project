import Foundation

// MARK: - Routes

/// A screen the apps can open from a push notification, an in-app notification or a
/// `qabnah://` deep link. Pure data: each app maps it onto its own navigation state.
public enum AppRoute: Hashable, Sendable {
    /// Consumer: order detail.
    case order(id: String)
    /// Consumer: live tracking of an order (pushed on top of its detail).
    case tracking(orderId: String)
    /// Both apps: a support ticket.
    case ticket(id: String)
    /// Captain: an incoming offer.
    case offer(id: String)
    /// Captain: one of my deliveries (the active-delivery screen).
    case delivery(id: String)
    /// Captain: onboarding documents (document rejected / expiring).
    case documents
    /// Captain: home tab (approval / rejection notices).
    case captainHome
}

// MARK: - Push payload

/// Push notification payload as described in `API_CONTRACT.yaml` (`info.description`):
/// `title`, `body` and a data map `{type, orderId?, deliveryId?, offerId?, ticketId?, number?}`.
///
/// APNs delivers custom keys at the top level of `userInfo` next to `aps`; FCM-style senders nest
/// them under `data` (a dictionary, or a JSON string). Both are accepted, as are numeric ids.
public struct PushPayload: Hashable, Sendable {
    public var type: String?
    public var orderId: String?
    public var deliveryId: String?
    public var offerId: String?
    public var ticketId: String?
    public var number: String?
    public var title: String?
    public var body: String?

    public init(type: String? = nil, orderId: String? = nil, deliveryId: String? = nil, offerId: String? = nil,
                ticketId: String? = nil, number: String? = nil, title: String? = nil, body: String? = nil) {
        self.type = type
        self.orderId = orderId
        self.deliveryId = deliveryId
        self.offerId = offerId
        self.ticketId = ticketId
        self.number = number
        self.title = title
        self.body = body
    }

    /// Parses `UNNotificationContent.userInfo` (or any APNs / FCM style dictionary).
    public init(userInfo: [AnyHashable: Any]) {
        var fields: [String: Any] = [:]
        for (key, value) in userInfo {
            if let k = key.base as? String { fields[k] = value }
        }
        // Nested `data` (dictionary or JSON-encoded string) fills in anything not at the top level.
        var nested: [String: Any] = [:]
        if let dict = fields["data"] as? [String: Any] {
            nested = dict
        } else if let dict = fields["data"] as? [AnyHashable: Any] {
            for (key, value) in dict { if let k = key.base as? String { nested[k] = value } }
        } else if let text = fields["data"] as? String, let data = text.data(using: .utf8),
                  let dict = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
            nested = dict
        }
        func value(_ key: String) -> String? {
            Self.string(fields[key]) ?? Self.string(nested[key])
        }
        type = value("type")
        orderId = value("orderId")
        deliveryId = value("deliveryId")
        offerId = value("offerId")
        ticketId = value("ticketId")
        number = value("number")

        var alertTitle: String?
        var alertBody: String?
        if let aps = fields["aps"] as? [String: Any] ?? Self.stringKeyed(fields["aps"]) {
            if let alert = aps["alert"] as? [String: Any] ?? Self.stringKeyed(aps["alert"]) {
                alertTitle = Self.string(alert["title"])
                alertBody = Self.string(alert["body"])
            } else {
                alertBody = Self.string(aps["alert"])
            }
        }
        title = alertTitle ?? value("title")
        body = alertBody ?? value("body")
    }

    /// The same mapping for an in-app notification (`GET /me/notifications`).
    public init(notification: AppNotification) {
        let data = notification.data
        self.init(type: notification.type.isEmpty ? nil : notification.type,
                  orderId: Self.nonEmpty(data?["orderId"]?.stringValue),
                  deliveryId: Self.nonEmpty(data?["deliveryId"]?.stringValue),
                  offerId: Self.nonEmpty(data?["offerId"]?.stringValue),
                  ticketId: Self.nonEmpty(data?["ticketId"]?.stringValue),
                  number: Self.nonEmpty(data?["number"]?.stringValue),
                  title: Self.nonEmpty(notification.title),
                  body: Self.nonEmpty(notification.body))
    }

    /// Where tapping this notification should take the user in `app`, or nil to just open the app.
    public func route(for app: ClientApp) -> AppRoute? {
        let kind = type ?? ""
        switch app {
        case .captain:
            if kind == "support.reply", let t = ticketId { return .ticket(id: t) }
            if kind.hasPrefix("offer."), let o = offerId { return .offer(id: o) }
            if kind.hasPrefix("offer.") { return .captainHome }
            if kind.hasPrefix("delivery."), let d = deliveryId { return .delivery(id: d) }
            if kind == "captain.document_rejected" || kind == "captain.document_expiring" { return .documents }
            if kind.hasPrefix("captain.") { return .captainHome }
            if let o = offerId { return .offer(id: o) }
            if let d = deliveryId { return .delivery(id: d) }
            if let t = ticketId { return .ticket(id: t) }
            return nil
        default:
            if kind.hasPrefix("support."), let t = ticketId { return .ticket(id: t) }
            if let o = orderId {
                // Captain on the way / picked up: the live map is what the customer wants.
                if kind == "delivery.assigned" || kind == "delivery.picked_up" { return .tracking(orderId: o) }
                return .order(id: o)
            }
            if let t = ticketId { return .ticket(id: t) }
            return nil
        }
    }

    static func string(_ value: Any?) -> String? {
        switch value {
        case let s as String: return nonEmpty(s)
        case let i as Int: return String(i)
        case let i as Int64: return String(i)
        case let d as Double: return d.rounded() == d && abs(d) < 1e15 ? String(Int64(d)) : String(d)
        case let n as NSNumber: return n.stringValue
        default: return nil
        }
    }

    static func nonEmpty(_ s: String?) -> String? {
        guard let t = s?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
        return t
    }

    private static func stringKeyed(_ value: Any?) -> [String: Any]? {
        guard let dict = value as? [AnyHashable: Any] else { return nil }
        var out: [String: Any] = [:]
        for (key, v) in dict { if let k = key.base as? String { out[k] = v } }
        return out
    }
}

// MARK: - Deep links

/// `qabnah://order/<id>`, `qabnah://offer/<id>`, `qabnah://delivery/<id>`, `qabnah://ticket/<id>`
/// (contract), plus `qabnah://order/<id>/tracking`. The captain app also registers
/// `qabnah-captain://…` so links can target it when both apps are installed.
public enum DeepLink {
    public static let scheme = "qabnah"
    public static let captainScheme = "qabnah-captain"
    public static let schemes: Set<String> = [scheme, captainScheme]

    /// Route for a deep link in `app`, or nil if the URL isn't a deep link this app handles
    /// (e.g. `qabnah://payment-return`, another app's screen, a missing id).
    public static func route(from url: URL, app: ClientApp) -> AppRoute? {
        guard let s = url.scheme?.lowercased(), schemes.contains(s) else { return nil }
        var parts: [String] = []
        if let host = url.host, !host.isEmpty { parts.append(host) }
        parts += url.pathComponents.filter { $0 != "/" && !$0.isEmpty }
        guard let kind = parts.first?.lowercased() else { return nil }
        let id = parts.count > 1 ? PushPayload.nonEmpty(parts[1]) : nil
        let route: AppRoute?
        switch kind {
        case "order":
            route = id.map { parts.count > 2 && parts[2].lowercased() == "tracking" ? .tracking(orderId: $0) : .order(id: $0) }
        case "tracking":
            route = id.map { .tracking(orderId: $0) }
        case "ticket":
            route = id.map { .ticket(id: $0) }
        case "offer":
            route = id.map { .offer(id: $0) }
        case "delivery":
            route = id.map { .delivery(id: $0) }
        case "documents":
            route = .documents
        default:
            route = nil
        }
        guard let route, route.isHandled(by: app) else { return nil }
        return route
    }

    /// Canonical link for a route (nil for routes without a public link).
    public static func url(for route: AppRoute) -> URL? {
        func make(_ kind: String, _ id: String, _ suffix: String = "") -> URL? {
            let allowed = CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))
            let encoded = id.addingPercentEncoding(withAllowedCharacters: allowed) ?? id
            return URL(string: "\(scheme)://\(kind)/\(encoded)\(suffix)")
        }
        switch route {
        case .order(let id): return make("order", id)
        case .tracking(let id): return make("order", id, "/tracking")
        case .ticket(let id): return make("ticket", id)
        case .offer(let id): return make("offer", id)
        case .delivery(let id): return make("delivery", id)
        case .documents: return URL(string: "\(scheme)://documents")
        case .captainHome: return nil
        }
    }
}

public extension AppRoute {
    /// Whether `app` has a screen for this route.
    func isHandled(by app: ClientApp) -> Bool {
        switch self {
        case .ticket: return true
        case .order, .tracking: return app == .consumer
        case .offer, .delivery, .documents, .captainHome: return app == .captain
        }
    }
}
