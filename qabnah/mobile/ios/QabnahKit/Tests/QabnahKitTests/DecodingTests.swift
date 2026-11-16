import XCTest
@testable import QabnahKit

func fixture(_ name: String) throws -> Data {
    guard let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures") else {
        throw XCTSkip("fixture \(name).json missing")
    }
    return try Data(contentsOf: url)
}

func decodeFixture<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
    try JSONDecoder.qabnah.decode(T.self, from: fixture(name))
}

final class DecodingTests: XCTestCase {
    func testOrderDecodes() throws {
        let order = try decodeFixture(Order.self, "order")
        XCTAssertEqual(order.number, "QB100001")
        XCTAssertEqual(order.type, .marketplace)
        XCTAssertEqual(order.status, .outForDelivery)
        XCTAssertEqual(order.paymentMethod, .cod)
        XCTAssertEqual(order.items.count, 2)
        XCTAssertEqual(order.items[0].options.first?.nameAr, "كبير")
        XCTAssertEqual(order.items[1].notes, "extra cheese")
        XCTAssertEqual(order.totalBaisa, 2600)
        XCTAssertEqual(order.delivery?.status, .pickedUp)
        XCTAssertEqual(order.delivery?.deliveryPin, "4821")
        XCTAssertEqual(order.delivery?.captain?.firstName, "Salim")
        XCTAssertEqual(order.delivery?.captain?.location?.heading, 90)
        XCTAssertEqual(order.delivery?.dropoff?.location, LatLng(lat: 23.61, lng: 58.45))
        XCTAssertEqual(order.timeline.count, 3)
        XCTAssertFalse(order.rated)
        // Fractional and non-fractional ISO-8601 both decode.
        XCTAssertNotNil(order.acceptedAt)
        XCTAssertNotNil(order.readyAt)
        XCTAssertFalse(order.isCancellable, "marketplace order out for delivery cannot be cancelled")
        XCTAssertTrue(order.isTrackable)
        XCTAssertFalse(order.canRate)
    }

    func testOrderRoundTrips() throws {
        let order = try decodeFixture(Order.self, "order")
        let data = try JSONEncoder.qabnah.encode(order)
        let again = try JSONDecoder.qabnah.decode(Order.self, from: data)
        XCTAssertEqual(order, again)
    }

    func testOrderPageWithMissingOptionalFields() throws {
        let json = """
        {"items":[{"id":"o1","type":"c2c","status":"placed","paymentMethod":"online","createdAt":"2026-11-16T09:30:00Z"}],
         "total":41,"limit":20,"offset":20}
        """
        let page = try JSONDecoder.qabnah.decode(Page<Order>.self, from: Data(json.utf8))
        let o = try XCTUnwrap(page.items.first)
        XCTAssertEqual(o.items, [])
        XCTAssertEqual(o.totalBaisa, 0)
        XCTAssertEqual(o.paymentStatus, "")
        XCTAssertNil(o.delivery)
        XCTAssertTrue(o.isCancellable)
        XCTAssertTrue(page.hasMore)
    }

    func testStorefrontDecodes() throws {
        let sf = try decodeFixture(Storefront.self, "storefront")
        XCTAssertEqual(sf.merchant.slug, "karak-house")         // via dynamic member lookup
        XCTAssertEqual(sf.merchant.brandColor, "#7A3E12")
        XCTAssertEqual(sf.merchant.addressText, "Al Khuwair, Way 3021")
        XCTAssertEqual(sf.merchant.whatsappPhone, "+96891112222")
        XCTAssertEqual(sf.merchant.openingHours.first?.close, "23:30")
        XCTAssertEqual(sf.merchant.category, .cafe)
        XCTAssertTrue(sf.merchant.acceptsCod)
        XCTAssertEqual(sf.visibleBanners.map(\.id), ["b0", "b1"])
        XCTAssertEqual(sf.visibleCategories.map(\.id), ["cat-1"], "empty categories are hidden")
        let karak = try XCTUnwrap(sf.categories.first?.products.first)
        XCTAssertEqual(karak.optionGroups.count, 2)
        XCTAssertEqual(karak.optionGroups[0].kind, .variant)
        XCTAssertEqual(karak.optionGroups[1].effectiveMax, 2)
        XCTAssertFalse(karak.optionGroups[1].options[3].available)
        XCTAssertEqual(sf.uncategorized.first?.compareAtPriceBaisa, 600)
        XCTAssertEqual(sf.uncategorized.first?.maxQuantity, 3)
        XCTAssertEqual(karak.name(.ar), "شاي كرك")
        XCTAssertEqual(karak.description(.en), "Cardamom & saffron")
    }

    func testStorefrontRoundTrips() throws {
        let sf = try decodeFixture(Storefront.self, "storefront")
        let again = try JSONDecoder.qabnah.decode(Storefront.self, from: JSONEncoder.qabnah.encode(sf))
        XCTAssertEqual(sf, again)
    }

    func testStoresListToleratesUnknownCategory() throws {
        let list = try decodeFixture(ItemsResponse<MerchantSummary>.self, "stores")
        XCTAssertEqual(list.items.count, 2)
        XCTAssertEqual(list.items[1].category, .unknown)
        XCTAssertEqual(list.items[1].minOrderBaisa, 0)
        XCTAssertFalse(list.items[1].isOpen)
        XCTAssertNil(list.items[0].distanceM)
    }

    func testOffersDecode() throws {
        let offers = try decodeFixture(ItemsResponse<Offer>.self, "offers")
        XCTAssertEqual(offers.items.count, 2)
        let o = offers.items[0]
        XCTAssertEqual(o.earningBaisa, 650)
        XCTAssertEqual(o.codAmountBaisa, 2600)
        XCTAssertEqual(o.pickupArea, "Al Khuwair")
        XCTAssertEqual(o.merchantName, "Karak House")
        XCTAssertEqual(o.orderType, .marketplace)
        let now = try XCTUnwrap(ISO8601.parse("2026-11-16T09:40:15Z"))
        XCTAssertEqual(o.secondsRemaining(now: now), 45)
        XCTAssertFalse(o.isExpired(now: now))
        XCTAssertTrue(o.isExpired(now: now.addingTimeInterval(60)))
        XCTAssertEqual(offers.items[1].orderType, .c2c)
        XCTAssertNil(offers.items[1].merchantName)
    }

    func testCaptainProfileDecodes() throws {
        let p = try decodeFixture(CaptainProfile.self, "captain_profile")
        XCTAssertEqual(p.status, .pendingDocuments)
        XCTAssertFalse(p.canGoOnline)
        XCTAssertEqual(p.vehicleType, .bike)
        XCTAssertEqual(p.requiredDocuments.count, 4)
        XCTAssertEqual(p.missingDocuments, [.drivingLicense, .vehicleRegistration, .profilePhoto])
        XCTAssertEqual(p.documents[2].docType, .unknown, "unknown doc types must not break decoding")
        // Latest national_id upload wins.
        XCTAssertEqual(p.document(for: .nationalId)?.id, "doc-2")
        let checklist = p.documentChecklist
        XCTAssertEqual(checklist.count, 4)
        XCTAssertEqual(checklist[0].type, .nationalId)
        XCTAssertFalse(checklist[0].missing)
        XCTAssertEqual(checklist[0].document?.status, .pending)
        XCTAssertTrue(checklist[1].missing)
        XCTAssertEqual(p.availability.first, AvailabilitySlot(weekday: 0, start: "08:00", end: "14:00"))
    }

    func testMeWithoutCaptain() throws {
        let me = try decodeFixture(Me.self, "me")
        XCTAssertNil(me.captain)
        XCTAssertEqual(me.user.firstName, "Salim")
        XCTAssertEqual(me.roles.first?.key, "captain")
    }

    func testTrackingDecodes() throws {
        let t = try decodeFixture(Tracking.self, "tracking")
        XCTAssertEqual(t.orderStatus, .outForDelivery)
        XCTAssertEqual(t.deliveryStatus, .pickedUp)
        XCTAssertEqual(t.captain?.location?.latLng, LatLng(lat: 23.6, lng: 58.42))
        XCTAssertNil(t.captain?.location?.heading)
        XCTAssertNil(t.captain?.phone)
        XCTAssertEqual(t.path.count, 2)
        XCTAssertNotNil(t.etaDropoffAt)

        let u = try decodeFixture(Tracking.self, "tracking_unassigned")
        XCTAssertNil(u.deliveryStatus)
        XCTAssertNil(u.captain)
        XCTAssertEqual(u.path, [])
    }

    func testCaptainDeliveryDecodes() throws {
        let d = try decodeFixture(CaptainDelivery.self, "captain_delivery")
        XCTAssertEqual(d.id, "d0000000-0000-4000-8000-000000000001")
        XCTAssertEqual(d.status, .assigned)                  // via dynamic member lookup
        XCTAssertEqual(d.orderNumber, "QB100001")
        XCTAssertEqual(d.earningBaisa, 650)
        XCTAssertEqual(d.codAmountBaisa, 2600)
        XCTAssertEqual(d.nextActions, [.arrivePickup, .release, .unknown])
        XCTAssertEqual(d.stepActions, [.arrivePickup])
        XCTAssertEqual(d.currentTarget?.address, "Al Khuwair, Way 3021")
        XCTAssertTrue(d.isActive)
        let again = try JSONDecoder.qabnah.decode(CaptainDelivery.self, from: JSONEncoder.qabnah.encode(d))
        XCTAssertEqual(again, d)
    }

    func testAuthEarningsNotificationsTicket() throws {
        let auth = try decodeFixture(AuthResult.self, "auth_result")
        XCTAssertEqual(auth.isNewUser, true)
        XCTAssertEqual(auth.tokens.expiresIn, 900)

        let e = try decodeFixture(Earnings.self, "earnings")
        XCTAssertEqual(e.deliveriesCount, 7)
        XCTAssertEqual(e.balanceDirection, .captainOwesPlatform(12950))
        XCTAssertEqual(e.entries.map(\.id), [101, 102])

        let n = try decodeFixture(NotificationPage.self, "notifications")
        XCTAssertEqual(n.unread, 1)
        XCTAssertEqual(n.items.first?.orderId, "6f1c2b4e-6a0d-4d3b-9a61-2f8f6b1f1001")
        XCTAssertFalse(n.items[0].isRead)

        let t = try decodeFixture(Ticket.self, "ticket")
        XCTAssertEqual(t.category, .orderIssue)
        XCTAssertEqual(t.messages.first?.author?.isStaff, false)
    }

    func testErrorEnvelopeToAPIError() throws {
        let err = APIError.from(status: 422, data: try fixture("error_422"))
        XCTAssertEqual(err.status, 422)
        XCTAssertEqual(err.code, "validation_error")
        XCTAssertEqual(err.serverMessage, "Wrong delivery PIN")
        XCTAssertEqual(err.details?["field"]?.stringValue, "pin")
        XCTAssertEqual(err.details?["attemptsLeft"]?.doubleValue, 2)
        XCTAssertTrue(err.isUnprocessable)
        XCTAssertEqual(err.errorDescription, "Wrong delivery PIN")

        let html = APIError.from(status: 502, data: Data("<html>Bad gateway</html>".utf8))
        guard case .http(502, let body) = html else { return XCTFail("expected .http") }
        XCTAssertEqual(body, "<html>Bad gateway</html>")

        let conflict = APIError.from(status: 409, data: Data(#"{"error":{"code":"conflict","message":"Offer already taken"}}"#.utf8))
        XCTAssertTrue(conflict.isConflict)
        XCTAssertNil(conflict.details)
    }

    func testRequestBodiesOmitNils() throws {
        let body = DeliveryCompleteInput(pin: " 4821 ", recipientName: "  ", codCollectedBaisa: 2600)
        let json = try XCTUnwrap(String(data: JSONEncoder.qabnah.encode(body), encoding: .utf8))
        XCTAssertEqual(json, #"{"codCollectedBaisa":2600,"pin":"4821"}"#)

        let ship = ShipmentInput(
            pickup: PlaceInput(location: LatLng(lat: 1, lng: 2), contactName: "A"),
            dropoff: PlaceInput(location: LatLng(lat: 3, lng: 4)),
            package: .init(size: .small, description: "Keys"),
            paymentMethod: .online, codPayer: .recipient)
        let obj = try JSONSerialization.jsonObject(with: JSONEncoder.qabnah.encode(ship)) as? [String: Any]
        XCTAssertNil(obj?["codPayer"], "codPayer is only sent for COD")
        XCTAssertEqual((obj?["package"] as? [String: Any])?["size"] as? String, "small")
        XCTAssertEqual(obj?["paymentMethod"] as? String, "online")

        let loc = LocationPing(lat: 23.6, lng: 58.4, heading: -1, speed: 8.2, accuracy: 5)
        XCTAssertNil(loc.heading)
        XCTAssertEqual(loc.speed, 8.2)
    }
}
