import Foundation

public enum HTTPMethod: String, Sendable {
    case get = "GET", post = "POST", put = "PUT", patch = "PATCH", delete = "DELETE"
}

/// A typed description of one API call. `Response` is what a 2xx body decodes to
/// (`EmptyResponse` for 204 / ignorable bodies).
public struct Endpoint<Response: Decodable> {
    public var method: HTTPMethod
    public var path: String
    public var query: [URLQueryItem]
    public var body: AnyEncodable?
    public var headers: [String: String]
    public var requiresAuth: Bool

    public init(_ method: HTTPMethod, _ path: String, query: [URLQueryItem] = [], body: AnyEncodable? = nil,
                headers: [String: String] = [:], requiresAuth: Bool = true) {
        self.method = method
        self.path = path
        self.query = query
        self.body = body
        self.headers = headers
        self.requiresAuth = requiresAuth
    }

    public static func get(_ path: String, query: [URLQueryItem] = [], auth: Bool = true) -> Endpoint {
        Endpoint(.get, path, query: query, requiresAuth: auth)
    }

    public static func send<B: Encodable>(_ method: HTTPMethod, _ path: String, body: B?, auth: Bool = true,
                                          headers: [String: String] = [:]) -> Endpoint {
        Endpoint(method, path, body: body.map(AnyEncodable.init), headers: headers, requiresAuth: auth)
    }

    /// Adds `Idempotency-Key` (mutating order endpoints).
    public func idempotent(_ key: String) -> Endpoint {
        var copy = self
        copy.headers["Idempotency-Key"] = key
        return copy
    }
}

private func q(_ name: String, _ value: CustomStringConvertible?) -> URLQueryItem? {
    value.map { URLQueryItem(name: name, value: $0.description) }
}

private func paging(_ limit: Int?, _ offset: Int?) -> [URLQueryItem] {
    [q("limit", limit), q("offset", offset)].compactMap { $0 }
}

private func pathID(_ id: String) -> String {
    id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? id
}

/// Every endpoint the iOS apps use, named after `API_CONTRACT.yaml` paths.
public enum Endpoints {
    // MARK: Auth
    public static func requestOTP(phone: String) -> Endpoint<OTPRequestResult> {
        .send(.post, "/auth/otp/request", body: OTPRequestInput(phone: phone), auth: false)
    }

    public static func verifyOTP(phone: String, code: String, fullName: String?) -> Endpoint<AuthResult> {
        .send(.post, "/auth/otp/verify", body: OTPVerifyInput(phone: phone, code: code, fullName: fullName), auth: false)
    }

    public static func refresh(refreshToken: String) -> Endpoint<TokensResponse> {
        .send(.post, "/auth/refresh", body: RefreshInput(refreshToken: refreshToken), auth: false)
    }

    public static func logout(refreshToken: String) -> Endpoint<EmptyResponse> {
        .send(.post, "/auth/logout", body: RefreshInput(refreshToken: refreshToken))
    }

    // MARK: Me
    public static func me() -> Endpoint<Me> { .get("/me") }

    public static func updateMe(_ input: ProfileUpdateInput) -> Endpoint<Me> {
        .send(.patch, "/me", body: input)
    }

    public static func addresses() -> Endpoint<ItemsResponse<Address>> { .get("/me/addresses") }

    public static func createAddress(_ input: AddressInput) -> Endpoint<Address> {
        .send(.post, "/me/addresses", body: input)
    }

    public static func updateAddress(id: String, _ input: AddressInput) -> Endpoint<Address> {
        .send(.patch, "/me/addresses/\(pathID(id))", body: input)
    }

    public static func deleteAddress(id: String) -> Endpoint<EmptyResponse> {
        Endpoint(.delete, "/me/addresses/\(pathID(id))")
    }

    public static func notifications(limit: Int? = nil, offset: Int? = nil) -> Endpoint<NotificationPage> {
        .get("/me/notifications", query: paging(limit, offset))
    }

    public static func markNotificationRead(id: String) -> Endpoint<EmptyResponse> {
        Endpoint(.post, "/me/notifications/\(pathID(id))/read")
    }

    public static func registerDevice(_ input: DeviceRegistrationInput) -> Endpoint<EmptyResponse> {
        .send(.post, "/me/devices", body: input)
    }

    public static func unregisterDevice(token: String) -> Endpoint<EmptyResponse> {
        .send(.post, "/me/devices/unregister", body: DeviceUnregisterInput(token: token))
    }

    /// `GET /me/export` — personal data export (free-form JSON object). Use
    /// `APIClient.data(for:)` to get the raw bytes for sharing.
    public static func exportMyData() -> Endpoint<JSONValue> { .get("/me/export") }

    /// `POST /me/delete` — 204 on success, 409 while orders/deliveries are active or a balance is unsettled.
    public static func deleteAccount() -> Endpoint<EmptyResponse> {
        .send(.post, "/me/delete", body: AccountDeletionInput())
    }

    // MARK: Public
    public static func zones() -> Endpoint<ItemsResponse<Zone>> { .get("/zones", auth: false) }

    public static func stores(near location: LatLng? = nil, category: MerchantCategory? = nil, query: String? = nil,
                              limit: Int? = nil, offset: Int? = nil) -> Endpoint<ItemsResponse<MerchantSummary>> {
        let trimmed = query?.trimmingCharacters(in: .whitespacesAndNewlines)
        let items: [URLQueryItem?] = [
            q("lat", location?.lat), q("lng", location?.lng),
            q("category", category?.rawValue),
            q("q", (trimmed?.isEmpty ?? true) ? nil : trimmed),
        ]
        return .get("/stores", query: items.compactMap { $0 } + paging(limit, offset), auth: false)
    }

    public static func storefront(slug: String) -> Endpoint<Storefront> {
        .get("/stores/\(pathID(slug))", auth: false)
    }

    public static func deliveryQuote(_ input: DeliveryQuoteInput) -> Endpoint<DeliveryQuote> {
        .send(.post, "/quotes/delivery", body: input, auth: false)
    }

    // MARK: Consumer
    public static func quoteOrder(_ input: MarketplaceOrderInput) -> Endpoint<PriceBreakdown> {
        .send(.post, "/orders/quote", body: input)
    }

    public static func placeOrder(_ input: MarketplaceOrderInput, idempotencyKey: String) -> Endpoint<Order> {
        Endpoint<Order>.send(.post, "/orders", body: input).idempotent(idempotencyKey)
    }

    public enum OrderListStatus: String, Sendable { case active, past }

    public static func orders(status: OrderListStatus? = nil, limit: Int? = nil, offset: Int? = nil) -> Endpoint<Page<Order>> {
        .get("/orders", query: [q("status", status?.rawValue)].compactMap { $0 } + paging(limit, offset))
    }

    public static func order(id: String) -> Endpoint<Order> { .get("/orders/\(pathID(id))") }

    public static func cancelOrder(id: String, reason: String?) -> Endpoint<Order> {
        .send(.post, "/orders/\(pathID(id))/cancel", body: ReasonInput(reason: reason))
    }

    public static func checkout(orderId: String, returnUrl: String?) -> Endpoint<Checkout> {
        .send(.post, "/orders/\(pathID(orderId))/checkout", body: CheckoutInput(returnUrl: returnUrl))
    }

    public static func tracking(orderId: String) -> Endpoint<Tracking> {
        .get("/orders/\(pathID(orderId))/tracking")
    }

    public static func rateOrder(id: String, _ input: RatingInput) -> Endpoint<EmptyResponse> {
        .send(.post, "/orders/\(pathID(id))/rating", body: input)
    }

    public static func createShipment(_ input: ShipmentInput, idempotencyKey: String) -> Endpoint<Order> {
        Endpoint<Order>.send(.post, "/shipments", body: input).idempotent(idempotencyKey)
    }

    // MARK: Support
    public static func tickets() -> Endpoint<ItemsResponse<Ticket>> { .get("/support/tickets") }

    public static func ticket(id: String) -> Endpoint<Ticket> { .get("/support/tickets/\(pathID(id))") }

    public static func createTicket(_ input: TicketCreateInput) -> Endpoint<Ticket> {
        .send(.post, "/support/tickets", body: input)
    }

    public static func replyTicket(id: String, body: String) -> Endpoint<EmptyResponse> {
        .send(.post, "/support/tickets/\(pathID(id))/messages", body: TicketReplyInput(body: body))
    }

    // MARK: Captain
    public static func captainRegister(_ input: CaptainProfileInput) -> Endpoint<CaptainProfile> {
        .send(.post, "/captain/register", body: input)
    }

    public static func captainProfile() -> Endpoint<CaptainProfile> { .get("/captain/profile") }

    public static func updateCaptainProfile(_ input: CaptainProfileInput) -> Endpoint<CaptainProfile> {
        .send(.patch, "/captain/profile", body: input)
    }

    public static func addCaptainDocument(_ input: CaptainDocumentInput) -> Endpoint<CaptainDocument> {
        .send(.post, "/captain/documents", body: input)
    }

    public static func setCaptainZones(_ zoneIds: [String]) -> Endpoint<CaptainProfile> {
        .send(.put, "/captain/zones", body: ZonesInput(zoneIds: zoneIds))
    }

    public static func setCaptainAvailability(_ slots: [AvailabilitySlot]) -> Endpoint<CaptainProfile> {
        .send(.put, "/captain/availability", body: AvailabilityInput(slots: slots))
    }

    public static func setCaptainStatus(online: Bool, location: LatLng?) -> Endpoint<CaptainProfile> {
        .send(.post, "/captain/status", body: CaptainStatusInput(online: online, location: location))
    }

    public static func reportLocation(_ ping: LocationPing) -> Endpoint<EmptyResponse> {
        .send(.post, "/captain/location", body: ping)
    }

    public static func captainOffers() -> Endpoint<ItemsResponse<Offer>> { .get("/captain/offers") }

    public static func acceptOffer(id: String) -> Endpoint<CaptainDelivery> {
        Endpoint(.post, "/captain/offers/\(pathID(id))/accept")
    }

    public static func rejectOffer(id: String, reason: String?) -> Endpoint<EmptyResponse> {
        .send(.post, "/captain/offers/\(pathID(id))/reject", body: ReasonInput(reason: reason))
    }

    public enum CaptainDeliveryListStatus: String, Sendable { case active, history }

    public static func captainDeliveries(status: CaptainDeliveryListStatus? = nil, limit: Int? = nil,
                                         offset: Int? = nil) -> Endpoint<ItemsResponse<CaptainDelivery>> {
        .get("/captain/deliveries", query: [q("status", status?.rawValue)].compactMap { $0 } + paging(limit, offset))
    }

    public static func captainDelivery(id: String) -> Endpoint<CaptainDelivery> {
        .get("/captain/deliveries/\(pathID(id))")
    }

    public static func advanceDelivery(id: String, _ input: DeliveryStatusInput) -> Endpoint<CaptainDelivery> {
        .send(.post, "/captain/deliveries/\(pathID(id))/status", body: input)
    }

    public static func completeDelivery(id: String, _ input: DeliveryCompleteInput) -> Endpoint<CaptainDelivery> {
        .send(.post, "/captain/deliveries/\(pathID(id))/complete", body: input)
    }

    public static func captainEarnings(from: String?, to: String?) -> Endpoint<Earnings> {
        .get("/captain/earnings", query: [q("from", from), q("to", to)].compactMap { $0 })
    }

    public static func captainPayouts() -> Endpoint<ItemsResponse<Settlement>> { .get("/captain/payouts") }
}
