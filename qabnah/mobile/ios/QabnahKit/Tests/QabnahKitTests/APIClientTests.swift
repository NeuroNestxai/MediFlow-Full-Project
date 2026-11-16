import XCTest
@testable import QabnahKit
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Scriptable transport: a handler decides the response for each request.
final class MockTransport: HTTPTransport, @unchecked Sendable {
    typealias Handler = @Sendable (URLRequest) async throws -> (Int, Data)
    private let lock = NSLock()
    private var _requests: [URLRequest] = []
    let handler: Handler

    init(_ handler: @escaping Handler) { self.handler = handler }

    var requests: [URLRequest] {
        lock.lock(); defer { lock.unlock() }
        return _requests
    }

    private func record(_ request: URLRequest) {
        lock.lock(); defer { lock.unlock() }
        _requests.append(request)
    }

    func count(path: String) -> Int { requests.filter { $0.url?.path == path }.count }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        record(request)
        let (status, data) = try await handler(request)
        let resp = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
        return (data, resp)
    }
}

private func json(_ s: String) -> Data { Data(s.utf8) }

final class APIClientTests: XCTestCase {
    let config = AppConfig(baseURL: URL(string: "http://localhost:4000/v1")!)

    func testRequestBuilding() throws {
        let store = InMemoryTokenStore(AuthTokens(accessToken: "AT", refreshToken: "RT"))
        let client = APIClient(config: config, tokenStore: store, transport: MockTransport { _ in (200, Data()) })
        client.language = .en

        let get = try client.makeRequest(Endpoints.stores(near: LatLng(lat: 23.6, lng: 58.4), category: .cafe, query: " karak "),
                                         accessToken: "AT")
        XCTAssertEqual(get.httpMethod, "GET")
        XCTAssertEqual(get.url?.absoluteString, "http://localhost:4000/v1/stores?lat=23.6&lng=58.4&category=cafe&q=karak")
        XCTAssertNil(get.value(forHTTPHeaderField: "Authorization"), "public endpoint carries no token")
        XCTAssertEqual(get.value(forHTTPHeaderField: "Accept-Language"), "en, ar;q=0.5")

        let input = MarketplaceOrderInput(merchantId: "m1", items: [.init(productId: "p1", quantity: 2)], addressId: "a1",
                                          paymentMethod: .online)
        let post = try client.makeRequest(Endpoints.placeOrder(input, idempotencyKey: "KEY-1"), accessToken: "AT")
        XCTAssertEqual(post.httpMethod, "POST")
        XCTAssertEqual(post.url?.path, "/v1/orders")
        XCTAssertEqual(post.value(forHTTPHeaderField: "Authorization"), "Bearer AT")
        XCTAssertEqual(post.value(forHTTPHeaderField: "Idempotency-Key"), "KEY-1")
        XCTAssertEqual(post.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let body = try XCTUnwrap(post.httpBody.flatMap { try JSONSerialization.jsonObject(with: $0) as? [String: Any] })
        XCTAssertEqual(body["paymentMethod"] as? String, "online")
        XCTAssertEqual(body["addressId"] as? String, "a1")
        XCTAssertNil(body["dropoff"])

        let accept = try client.makeRequest(Endpoints.acceptOffer(id: "o1"), accessToken: "AT")
        XCTAssertEqual(accept.url?.path, "/v1/captain/offers/o1/accept")
        XCTAssertEqual(accept.httpBody, Data("{}".utf8))

        let hist = try client.makeRequest(Endpoints.captainDeliveries(status: .history, limit: 20, offset: 40), accessToken: "AT")
        XCTAssertEqual(hist.url?.query, "status=history&limit=20&offset=40")
    }

    func testDecodesSuccessAndEmpty() async throws {
        let store = InMemoryTokenStore(AuthTokens(accessToken: "AT", refreshToken: "RT"))
        let transport = MockTransport { req in
            if req.url?.path == "/v1/orders/o1/tracking" { return (200, try fixture("tracking")) }
            return (204, Data())
        }
        let client = APIClient(config: config, tokenStore: store, transport: transport)
        let t = try await client.send(Endpoints.tracking(orderId: "o1"))
        XCTAssertEqual(t.captain?.firstName, "Salim")
        _ = try await client.send(Endpoints.markNotificationRead(id: "n1"))
    }

    func testErrorEnvelopeIsTyped() async throws {
        let store = InMemoryTokenStore(AuthTokens(accessToken: "AT", refreshToken: "RT"))
        let transport = MockTransport { _ in
            (409, json(#"{"error":{"code":"conflict","message":"Offer expired","details":{"reason":"expired"}}}"#))
        }
        let client = APIClient(config: config, tokenStore: store, transport: transport)
        do {
            _ = try await client.send(Endpoints.acceptOffer(id: "o1"))
            XCTFail("expected error")
        } catch let e as APIError {
            XCTAssertTrue(e.isConflict)
            XCTAssertEqual(e.code, "conflict")
            XCTAssertEqual(e.details?["reason"]?.stringValue, "expired")
        }
    }

    func testDecodingErrorIsReported() async throws {
        let store = InMemoryTokenStore(AuthTokens(accessToken: "AT", refreshToken: "RT"))
        let client = APIClient(config: config, tokenStore: store, transport: MockTransport { _ in (200, json(#"{"nope":1}"#)) })
        do {
            _ = try await client.send(Endpoints.order(id: "o1"))
            XCTFail("expected error")
        } catch APIError.decoding(let message) {
            XCTAssertTrue(message.contains("missing key 'id'"), message)
        }
    }

    func testMissingTokenIsUnauthorizedWithoutNetwork() async throws {
        let transport = MockTransport { _ in (200, Data()) }
        let client = APIClient(config: config, tokenStore: InMemoryTokenStore(), transport: transport)
        do {
            _ = try await client.send(Endpoints.me())
            XCTFail("expected error")
        } catch let e as APIError {
            XCTAssertEqual(e.status, 401)
        }
        XCTAssertTrue(transport.requests.isEmpty)
    }

    /// Five concurrent requests get 401 with the old token; exactly one refresh happens and all
    /// five are retried with the new token.
    func testRefreshIsSingleFlight() async throws {
        let store = InMemoryTokenStore(AuthTokens(accessToken: "OLD", refreshToken: "RT1"))
        let transport = MockTransport { req in
            if req.url?.path == "/v1/auth/refresh" {
                try await Task.sleep(nanoseconds: 100_000_000)
                let body = try JSONSerialization.jsonObject(with: req.httpBody ?? Data()) as? [String: Any]
                XCTAssertEqual(body?["refreshToken"] as? String, "RT1")
                return (200, json(#"{"accessToken":"NEW","refreshToken":"RT2","expiresIn":900}"#))
            }
            let auth = req.value(forHTTPHeaderField: "Authorization")
            if auth == "Bearer NEW" { return (200, try fixture("me")) }
            return (401, json(#"{"error":{"code":"unauthorized","message":"jwt expired"}}"#))
        }
        let client = APIClient(config: config, tokenStore: store, transport: transport)

        try await withThrowingTaskGroup(of: Me.self) { group in
            for _ in 0..<5 { group.addTask { try await client.send(Endpoints.me()) } }
            var n = 0
            for try await me in group {
                XCTAssertEqual(me.user.fullName, "Salim Al Harthy")
                n += 1
            }
            XCTAssertEqual(n, 5)
        }
        XCTAssertEqual(transport.count(path: "/v1/auth/refresh"), 1)
        XCTAssertEqual(store.load()?.accessToken, "NEW")
        XCTAssertEqual(store.load()?.refreshToken, "RT2")
        XCTAssertNotNil(store.load()?.accessTokenExpiresAt)
    }

    func testProactiveRefreshWhenExpiring() async throws {
        let store = InMemoryTokenStore(AuthTokens(accessToken: "OLD", refreshToken: "RT1",
                                                  accessTokenExpiresAt: Date().addingTimeInterval(5)))
        let transport = MockTransport { req in
            if req.url?.path == "/v1/auth/refresh" {
                return (200, json(#"{"accessToken":"NEW","refreshToken":"RT2","expiresIn":900}"#))
            }
            XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer NEW")
            return (200, try fixture("me"))
        }
        let client = APIClient(config: config, tokenStore: store, transport: transport)
        _ = try await client.send(Endpoints.me())
        XCTAssertEqual(transport.requests.map { $0.url!.path }, ["/v1/auth/refresh", "/v1/me"])
        let token = try await client.validAccessToken()
        XCTAssertEqual(token, "NEW")
    }

    func testRejectedRefreshExpiresSession() async throws {
        let store = InMemoryTokenStore(AuthTokens(accessToken: "OLD", refreshToken: "RT1"))
        let transport = MockTransport { _ in
            (401, json(#"{"error":{"code":"unauthorized","message":"refresh token reused"}}"#))
        }
        let client = APIClient(config: config, tokenStore: store, transport: transport)
        let expired = expectation(description: "session expired callback")
        client.onSessionExpired = { expired.fulfill() }
        do {
            _ = try await client.send(Endpoints.me())
            XCTFail("expected error")
        } catch let e as APIError {
            XCTAssertEqual(e.status, 401)
        }
        await fulfillment(of: [expired], timeout: 1)
        XCTAssertNil(store.load())
    }

    func testMultipartUpload() async throws {
        let store = InMemoryTokenStore(AuthTokens(accessToken: "AT", refreshToken: "RT"))
        let transport = MockTransport { req in
            XCTAssertEqual(req.url?.path, "/v1/files")
            let ct = try XCTUnwrap(req.value(forHTTPHeaderField: "Content-Type"))
            XCTAssertTrue(ct.hasPrefix("multipart/form-data; boundary="))
            let body = String(decoding: req.httpBody ?? Data(), as: UTF8.self)
            XCTAssertTrue(body.contains("name=\"purpose\"\r\n\r\nproof_of_delivery\r\n"))
            XCTAssertTrue(body.contains("name=\"file\"; filename=\"pod.jpg\"\r\nContent-Type: image/jpeg\r\n\r\nJPEGDATA\r\n"))
            XCTAssertTrue(body.hasSuffix("--\r\n"))
            return (201, json(#"{"id":"f1","url":"/v1/files/f1","mimeType":"image/jpeg","sizeBytes":8}"#))
        }
        let client = APIClient(config: config, tokenStore: store, transport: transport)
        let ref = try await client.uploadFile(data: Data("JPEGDATA".utf8), fileName: "pod.jpg", mimeType: "image/jpeg",
                                              purpose: .proofOfDelivery)
        XCTAssertEqual(ref.id, "f1")
        XCTAssertEqual(ref.sizeBytes, 8)
    }

    func testNetworkErrorMapping() async throws {
        let store = InMemoryTokenStore(AuthTokens(accessToken: "AT", refreshToken: "RT"))
        let client = APIClient(config: config, tokenStore: store, transport: MockTransport { _ in
            throw URLError(.notConnectedToInternet)
        })
        do {
            _ = try await client.send(Endpoints.me())
            XCTFail("expected error")
        } catch let e as APIError {
            XCTAssertTrue(e.isNetwork)
        }
    }
}

final class RealtimeMessageTests: XCTestCase {
    func testInboundDecoding() throws {
        let ev = try RealtimeInbound.decode(json(
            #"{"type":"event","channel":"order:o1","event":"delivery.location","data":{"lat":23.6,"lng":58.41,"heading":180,"etaDropoffAt":"2026-11-16T10:05:00Z"},"id":123}"#))
        guard case .event(let e) = ev else { return XCTFail("expected event") }
        XCTAssertEqual(e.channel, "order:o1")
        XCTAssertEqual(e.name, RealtimeEventName.deliveryLocation)
        XCTAssertEqual(e.id, 123)
        let loc = try e.decodeData(DeliveryLocationEventData.self)
        XCTAssertEqual(loc.latLng, LatLng(lat: 23.6, lng: 58.41))
        XCTAssertEqual(loc.heading, 180)
        XCTAssertNotNil(loc.etaDropoffAt)

        XCTAssertEqual(try RealtimeInbound.decode(json(#"{"type":"pong"}"#)), .pong)
        XCTAssertEqual(try RealtimeInbound.decode(json(#"{"type":"subscribed","channel":"captain:me"}"#)),
                       .subscribed(channel: "captain:me"))
        XCTAssertEqual(try RealtimeInbound.decode(json(#"{"type":"error","code":"forbidden","channel":"order:x"}"#)),
                       .error(code: "forbidden", channel: "order:x", message: nil))
        XCTAssertEqual(try RealtimeInbound.decode(json(#"{"type":"hello"}"#)), .unknown(type: "hello"))
    }

    func testOfferEventDecodesAsOffer() throws {
        let offers = try decodeFixture(ItemsResponse<Offer>.self, "offers")
        let data = try JSONDecoder.qabnah.decode(JSONValue.self, from: JSONEncoder.qabnah.encode(offers.items[0]))
        let e = RealtimeEvent(channel: RealtimeChannel.captainMe, name: RealtimeEventName.offerCreated, data: data)
        XCTAssertEqual(try e.decodeData(Offer.self), offers.items[0])
    }

    func testOutboundEncoding() throws {
        func obj(_ m: RealtimeOutbound) throws -> [String: Any] {
            try XCTUnwrap(JSONSerialization.jsonObject(with: m.encoded()) as? [String: Any])
        }
        XCTAssertEqual(try obj(.subscribe("order:o1"))["type"] as? String, "subscribe")
        XCTAssertEqual(try obj(.subscribe("order:o1"))["channel"] as? String, "order:o1")
        XCTAssertEqual(try obj(.unsubscribe("captain:me"))["type"] as? String, "unsubscribe")
        XCTAssertEqual(try obj(.ping).count, 1)
        let loc = try obj(.location(LocationPing(lat: 23.6, lng: 58.4, heading: 90, speed: 8.2, accuracy: 5)))
        XCTAssertEqual(loc["type"] as? String, "location")
        XCTAssertEqual(loc["lat"] as? Double, 23.6)
        XCTAssertEqual(loc["heading"] as? Double, 90)
        XCTAssertEqual(loc["accuracy"] as? Double, 5)
        let noHeading = try obj(.location(LocationPing(lat: 1, lng: 2, heading: -1)))
        XCTAssertNil(noHeading["heading"])
    }

    func testChannelRefCounting() async {
        let client = RealtimeClient(url: URL(string: "ws://localhost:1/v1/realtime")!) { "token" }
        await client.subscribe("order:o1")
        await client.subscribe("order:o1")
        await client.subscribe("captain:me")
        var active = await client.activeChannels
        XCTAssertEqual(active, ["order:o1", "captain:me"])
        await client.unsubscribe("order:o1")
        active = await client.activeChannels
        XCTAssertTrue(active.contains("order:o1"), "still referenced by another screen")
        await client.unsubscribe("order:o1")
        await client.unsubscribe("order:o1") // extra unsubscribe is a no-op
        active = await client.activeChannels
        XCTAssertEqual(active, ["captain:me"])
        await client.reset()
        active = await client.activeChannels
        XCTAssertTrue(active.isEmpty)
        let state = await client.state
        XCTAssertEqual(state, .idle)
    }
}
