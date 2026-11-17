import XCTest
@testable import QabnahKit
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

private func userInfo(_ name: String) throws -> [AnyHashable: Any] {
    let object = try JSONSerialization.jsonObject(with: fixture(name))
    let dict = try XCTUnwrap(object as? [String: Any])
    var out: [AnyHashable: Any] = [:]
    for (k, v) in dict { out[AnyHashable(k)] = v }
    return out
}

final class PushPayloadTests: XCTestCase {
    func testAPNsTopLevelKeys() throws {
        let p = PushPayload(userInfo: try userInfo("push_apns"))
        XCTAssertEqual(p.type, "delivery.picked_up")
        XCTAssertEqual(p.orderId, "6f1c2b4e-6a0d-4d3b-9a61-2f8f6b1f1001")
        XCTAssertEqual(p.deliveryId, "d0000000-0000-4000-8000-000000000001")
        XCTAssertEqual(p.number, "QB100001")
        XCTAssertEqual(p.title, "Your captain is on the way")
        XCTAssertEqual(p.body, "Salim picked up order QB100001")
        XCTAssertNil(p.offerId)
        XCTAssertEqual(p.route(for: .consumer), .tracking(orderId: "6f1c2b4e-6a0d-4d3b-9a61-2f8f6b1f1001"))
        // The captain app has no order screen; it falls back to the delivery.
        XCTAssertEqual(p.route(for: .captain), .delivery(id: "d0000000-0000-4000-8000-000000000001"))
    }

    func testNestedDataAndStringAlert() throws {
        let p = PushPayload(userInfo: try userInfo("push_fcm_style"))
        XCTAssertEqual(p.type, "offer.created")
        XCTAssertEqual(p.offerId, "of000000-0000-4000-8000-000000000001")
        XCTAssertEqual(p.body, "New delivery offer near Al Khuwair")
        XCTAssertNil(p.title)
        XCTAssertEqual(p.route(for: .captain), .offer(id: "of000000-0000-4000-8000-000000000001"))
        XCTAssertNil(p.route(for: .consumer))
    }

    func testDataAsJSONStringAndNumericValues() {
        let info: [AnyHashable: Any] = [
            "aps": ["alert": ["title": "Reply", "body": "We answered"]] as [String: Any],
            "data": #"{"type":"support.reply","ticketId":42}"#,
        ]
        let p = PushPayload(userInfo: info)
        XCTAssertEqual(p.type, "support.reply")
        XCTAssertEqual(p.ticketId, "42")
        XCTAssertEqual(p.route(for: .consumer), .ticket(id: "42"))
        XCTAssertEqual(p.route(for: .captain), .ticket(id: "42"))
    }

    func testTopLevelWinsAndEmptyStringsAreIgnored() {
        let info: [AnyHashable: Any] = [
            "type": "order.accepted", "orderId": "", "offerId": "  ",
            "data": ["orderId": "o-nested"] as [String: Any],
        ]
        let p = PushPayload(userInfo: info)
        XCTAssertEqual(p.orderId, "o-nested", "empty top-level value falls back to nested data")
        XCTAssertNil(p.offerId)
        XCTAssertEqual(p.route(for: .consumer), .order(id: "o-nested"))
    }

    func testConsumerRoutingTable() {
        func route(_ type: String?, order: String? = "o1", ticket: String? = nil) -> AppRoute? {
            PushPayload(type: type, orderId: order, ticketId: ticket).route(for: .consumer)
        }
        XCTAssertEqual(route("order.accepted"), .order(id: "o1"))
        XCTAssertEqual(route("order.rejected"), .order(id: "o1"))
        XCTAssertEqual(route("order.cancelled"), .order(id: "o1"))
        XCTAssertEqual(route("delivery.assigned"), .tracking(orderId: "o1"))
        XCTAssertEqual(route("delivery.picked_up"), .tracking(orderId: "o1"))
        XCTAssertEqual(route("delivery.delivered"), .order(id: "o1"))
        XCTAssertEqual(route("delivery.failed"), .order(id: "o1"))
        XCTAssertEqual(route("payment_link.paid"), .order(id: "o1"))
        XCTAssertEqual(route("support.reply", order: "o1", ticket: "t1"), .ticket(id: "t1"))
        XCTAssertEqual(route("support.reply", order: nil, ticket: nil), nil)
        XCTAssertEqual(route("some.future_type"), .order(id: "o1"), "unknown types still open the referenced order")
        XCTAssertEqual(route(nil, order: nil), nil)
    }

    func testCaptainRoutingTable() {
        func route(_ type: String?, offer: String? = nil, delivery: String? = nil, ticket: String? = nil) -> AppRoute? {
            PushPayload(type: type, deliveryId: delivery, offerId: offer, ticketId: ticket).route(for: .captain)
        }
        XCTAssertEqual(route("offer.created", offer: "of1"), .offer(id: "of1"))
        XCTAssertEqual(route("offer.created"), .captainHome)
        XCTAssertEqual(route("delivery.assigned", delivery: "d1"), .delivery(id: "d1"))
        XCTAssertEqual(route("captain.document_rejected"), .documents)
        XCTAssertEqual(route("captain.document_expiring"), .documents)
        XCTAssertEqual(route("captain.approved"), .captainHome)
        XCTAssertEqual(route("captain.rejected"), .captainHome)
        XCTAssertEqual(route("support.reply", ticket: "t9"), .ticket(id: "t9"))
        XCTAssertEqual(route(nil, delivery: "d2"), .delivery(id: "d2"))
        XCTAssertEqual(route(nil), nil)
    }

    func testInAppNotificationUsesSameMapping() throws {
        let page = try decodeFixture(NotificationPage.self, "notifications")
        let n = try XCTUnwrap(page.items.first)
        let p = PushPayload(notification: n)
        XCTAssertEqual(p.type, "order.status_changed")
        XCTAssertEqual(p.title, "Order on the way")
        XCTAssertEqual(p.route(for: .consumer), .order(id: "6f1c2b4e-6a0d-4d3b-9a61-2f8f6b1f1001"))
    }
}

final class DeepLinkTests: XCTestCase {
    private func route(_ s: String, _ app: ClientApp) -> AppRoute? {
        DeepLink.route(from: URL(string: s)!, app: app)
    }

    func testContractLinks() {
        XCTAssertEqual(route("qabnah://order/o1", .consumer), .order(id: "o1"))
        XCTAssertEqual(route("qabnah://order/o1/tracking", .consumer), .tracking(orderId: "o1"))
        XCTAssertEqual(route("qabnah://ticket/t1", .consumer), .ticket(id: "t1"))
        XCTAssertEqual(route("qabnah://ticket/t1", .captain), .ticket(id: "t1"))
        XCTAssertEqual(route("qabnah://offer/of1", .captain), .offer(id: "of1"))
        XCTAssertEqual(route("qabnah://delivery/d1", .captain), .delivery(id: "d1"))
        XCTAssertEqual(route("QABNAH://Order/o1", .consumer), .order(id: "o1"))
        XCTAssertEqual(route("qabnah-captain://offer/of1", .captain), .offer(id: "of1"))
        XCTAssertEqual(route("qabnah:///order/o2", .consumer), .order(id: "o2"), "empty host form")
    }

    func testLinksForTheOtherAppOrMalformed() {
        XCTAssertNil(route("qabnah://offer/of1", .consumer))
        XCTAssertNil(route("qabnah://delivery/d1", .consumer))
        XCTAssertNil(route("qabnah://order/o1", .captain))
        XCTAssertNil(route("qabnah://order", .consumer), "missing id")
        XCTAssertNil(route("qabnah://payment-return?orderId=o1", .consumer), "handled by the payment flow")
        XCTAssertNil(route("https://qabnah.om/order/o1", .consumer))
        XCTAssertNil(route("qabnah://unknown/x", .consumer))
    }

    func testURLForRouteRoundTrips() throws {
        let routes: [(AppRoute, ClientApp)] = [
            (.order(id: "o 1"), .consumer), (.tracking(orderId: "o1"), .consumer), (.ticket(id: "t1"), .consumer),
            (.offer(id: "of1"), .captain), (.delivery(id: "d1"), .captain), (.documents, .captain),
        ]
        for (r, app) in routes {
            let url = try XCTUnwrap(DeepLink.url(for: r))
            XCTAssertEqual(DeepLink.route(from: url, app: app), r, url.absoluteString)
        }
        XCTAssertEqual(DeepLink.url(for: .order(id: "o1"))?.absoluteString, "qabnah://order/o1")
        XCTAssertNil(DeepLink.url(for: .captainHome))
    }
}

final class AccountDataTests: XCTestCase {
    let config = AppConfig(baseURL: URL(string: "http://localhost:4000/v1")!)

    func testNewMeEndpoints() throws {
        let client = APIClient(config: config, tokenStore: InMemoryTokenStore(AuthTokens(accessToken: "AT", refreshToken: "RT")),
                               transport: MockTransport { _ in (200, Data()) })
        let export = try client.makeRequest(Endpoints.exportMyData(), accessToken: "AT")
        XCTAssertEqual(export.httpMethod, "GET")
        XCTAssertEqual(export.url?.path, "/v1/me/export")
        XCTAssertEqual(export.value(forHTTPHeaderField: "Authorization"), "Bearer AT")

        let delete = try client.makeRequest(Endpoints.deleteAccount(), accessToken: "AT")
        XCTAssertEqual(delete.httpMethod, "POST")
        XCTAssertEqual(delete.url?.path, "/v1/me/delete")
        let body = try XCTUnwrap(delete.httpBody.flatMap { try JSONSerialization.jsonObject(with: $0) as? [String: String] })
        XCTAssertEqual(body, ["confirm": "DELETE"])

        let unregister = try client.makeRequest(Endpoints.unregisterDevice(token: "abc123"), accessToken: "AT")
        XCTAssertEqual(unregister.url?.path, "/v1/me/devices/unregister")
        let ub = try XCTUnwrap(unregister.httpBody.flatMap { try JSONSerialization.jsonObject(with: $0) as? [String: String] })
        XCTAssertEqual(ub, ["token": "abc123"])

        let register = try client.makeRequest(Endpoints.registerDevice(DeviceRegistrationInput(app: .captain, token: "abc123")),
                                              accessToken: "AT")
        let rb = try XCTUnwrap(register.httpBody.flatMap { try JSONSerialization.jsonObject(with: $0) as? [String: String] })
        XCTAssertEqual(rb, ["platform": "ios", "app": "captain", "token": "abc123"])
    }

    func testExportRawBytesAndTypedDecoding() async throws {
        let raw = try fixture("me_export")
        let client = APIClient(config: config, tokenStore: InMemoryTokenStore(AuthTokens(accessToken: "AT", refreshToken: "RT")),
                               transport: MockTransport { _ in (200, raw) })
        let bytes = try await client.data(for: Endpoints.exportMyData())
        XCTAssertEqual(bytes, raw)
        let typed = try await client.send(Endpoints.exportMyData())
        XCTAssertEqual(typed["user"]?["phone"]?.stringValue, "+96891234567")
        XCTAssertEqual(typed["captain"], .null)
    }

    func testDeleteConflictSurfacesServerMessage() async throws {
        let client = APIClient(config: config, tokenStore: InMemoryTokenStore(AuthTokens(accessToken: "AT", refreshToken: "RT")),
                               transport: MockTransport { _ in
                                   (409, Data(#"{"error":{"code":"account_deletion_blocked","message":"You have orders in progress"}}"#.utf8))
                               })
        do {
            try await client.send(Endpoints.deleteAccount())
            XCTFail("expected 409")
        } catch let e as APIError {
            XCTAssertTrue(e.isConflict)
            XCTAssertEqual(e.code, "account_deletion_blocked")
            XCTAssertEqual(e.serverMessage, "You have orders in progress")
        }
    }

    func testDeleteSuccessAndClearSession() async throws {
        let store = InMemoryTokenStore(AuthTokens(accessToken: "AT", refreshToken: "RT"))
        let transport = MockTransport { _ in (204, Data()) }
        let client = APIClient(config: config, tokenStore: store, transport: transport)
        try await client.send(Endpoints.deleteAccount())
        client.clearSession()
        XCTAssertFalse(client.isSignedIn)
        XCTAssertEqual(transport.count(path: "/v1/auth/logout"), 0, "no logout call after deletion")
    }

    func testDeletionConfirmation() {
        XCTAssertTrue(AccountDeletionInput.isConfirmed("DELETE"))
        XCTAssertTrue(AccountDeletionInput.isConfirmed("  delete \n"))
        XCTAssertFalse(AccountDeletionInput.isConfirmed("DELET"))
        XCTAssertFalse(AccountDeletionInput.isConfirmed("حذف"))
        XCTAssertFalse(AccountDeletionInput.isConfirmed(""))
    }

    func testExportFileNameAndPrettyPrinting() throws {
        let date = try XCTUnwrap(ISO8601.parse("2026-11-16T21:30:00Z")) // 01:30 on the 17th in Muscat
        XCTAssertEqual(DataExport.fileName(app: .consumer, date: date), "qabnah-consumer-data-2026-11-17.json")
        let pretty = DataExport.prettyPrinted(try fixture("me_export"))
        let text = String(decoding: pretty, as: UTF8.self)
        XCTAssertTrue(text.contains("\n"), "pretty printed")
        XCTAssertTrue(text.contains("تم قبول طلبك"), "Arabic kept as UTF-8")
        let garbage = Data("not json".utf8)
        XCTAssertEqual(DataExport.prettyPrinted(garbage), garbage)

        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let url = try DataExport.write(try fixture("me_export"), app: .captain, date: date, directory: dir)
        XCTAssertEqual(url.lastPathComponent, "qabnah-captain-data-2026-11-17.json")
        let back = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        XCTAssertNotNil(back?["user"])
    }
}

final class InvoiceTests: XCTestCase {
    func testDeliveredOrderHasInvoice() throws {
        let order = try decodeFixture(Order.self, "order_delivered")
        XCTAssertEqual(order.status, .delivered)
        XCTAssertEqual(order.invoiceUrl, "/v1/invoices/6f1c2b4e-6a0d-4d3b-9a61-2f8f6b1f1002?exp=1763288640&sig=3b9f0c2a7d")
        XCTAssertTrue(order.hasInvoice)
        let config = AppConfig(baseURL: URL(string: "http://localhost:4000/v1")!)
        let url = try XCTUnwrap(config.resolve(order.invoiceUrl))
        XCTAssertEqual(url.host, "localhost")
        XCTAssertEqual(url.path, "/v1/invoices/6f1c2b4e-6a0d-4d3b-9a61-2f8f6b1f1002")
        XCTAssertTrue(url.query?.contains("sig=3b9f0c2a7d") ?? false, "signature query is kept")
        // Round trip keeps the field.
        let again = try JSONDecoder.qabnah.decode(Order.self, from: JSONEncoder.qabnah.encode(order))
        XCTAssertEqual(again.invoiceUrl, order.invoiceUrl)
    }

    func testInvoiceVisibilityRules() throws {
        var order = try decodeFixture(Order.self, "order")
        XCTAssertNil(order.invoiceUrl, "field missing in older payloads")
        XCTAssertFalse(order.hasInvoice)
        order.invoiceUrl = "https://api.qabnah.om/v1/invoices/x?sig=1"
        XCTAssertFalse(order.hasInvoice, "out for delivery + COD pending: not yet")
        order.paymentStatus = "paid"
        XCTAssertTrue(order.hasInvoice, "paid online orders can show the invoice before delivery")
        order.paymentStatus = "partially_refunded"
        XCTAssertTrue(order.hasInvoice)
        order.paymentStatus = "failed"
        XCTAssertFalse(order.hasInvoice)
        order.paymentStatus = "pending"
        order.status = .delivered
        XCTAssertTrue(order.hasInvoice)
        order.invoiceUrl = "  "
        XCTAssertFalse(order.hasInvoice)
    }
}
