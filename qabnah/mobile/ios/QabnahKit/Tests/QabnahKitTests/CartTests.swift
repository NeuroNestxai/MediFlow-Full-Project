import XCTest
@testable import QabnahKit

final class CartTests: XCTestCase {
    private func karak() throws -> (Product, MerchantSummary, Product) {
        let sf = try decodeFixture(Storefront.self, "storefront")
        return (sf.categories[0].products[0], sf.merchant.summary, sf.uncategorized[0])
    }

    func testVariantPreselectedAndPriced() throws {
        let (p, _, _) = try karak()
        var sel = ProductSelection(product: p)
        XCTAssertEqual(sel.selectedOptionIds, ["o-s"], "first available variant is pre-selected")
        XCTAssertEqual(sel.unitPriceBaisa, 400)
        XCTAssertTrue(sel.isValid)

        let size = p.optionGroups[0]
        sel.toggle(size.options[1], in: size) // Large
        XCTAssertEqual(sel.selectedOptionIds, ["o-l"], "variants are radio buttons")
        XCTAssertEqual(sel.unitPriceBaisa, 600)

        sel.toggle(size.options[1], in: size) // tapping the selected required variant keeps it
        XCTAssertEqual(sel.selectedOptionIds, ["o-l"])
    }

    func testAddonsCappedAtMaxSelect() throws {
        let (p, _, _) = try karak()
        var sel = ProductSelection(product: p)
        let extras = p.optionGroups[1]
        sel.toggle(extras.options[0], in: extras)  // +150
        sel.toggle(extras.options[1], in: extras)  // +100
        XCTAssertFalse(sel.canSelect(extras.options[2], in: extras), "max 2 add-ons")
        sel.toggle(extras.options[2], in: extras)  // ignored
        XCTAssertEqual(sel.unitPriceBaisa, 400 + 150 + 100)
        XCTAssertFalse(sel.canSelect(extras.options[3], in: extras), "unavailable option")
        sel.toggle(extras.options[0], in: extras)  // deselect
        XCTAssertTrue(sel.canSelect(extras.options[2], in: extras))
        XCTAssertEqual(sel.unitPriceBaisa, 500)
        XCTAssertEqual(sel.selectedOptionIds, ["o-s", "o-milk"])
    }

    func testMinSelectValidation() throws {
        let json = """
        {"id":"p","nameEn":"Box","nameAr":"علبة","basePriceBaisa":1000,
         "optionGroups":[{"id":"g","kind":"addon","nameEn":"Pick 2","nameAr":"اختر ٢","minSelect":2,"maxSelect":3,
           "options":[{"id":"a","nameEn":"A","nameAr":"أ","priceDeltaBaisa":0},{"id":"b","nameEn":"B","nameAr":"ب","priceDeltaBaisa":0},
                      {"id":"c","nameEn":"C","nameAr":"ج","priceDeltaBaisa":0}]}]}
        """
        let p = try JSONDecoder.qabnah.decode(Product.self, from: Data(json.utf8))
        var sel = ProductSelection(product: p)
        XCTAssertFalse(sel.isValid)
        XCTAssertEqual(sel.unsatisfiedGroups.map(\.id), ["g"])
        sel.toggle(p.optionGroups[0].options[0], in: p.optionGroups[0])
        sel.toggle(p.optionGroups[0].options[1], in: p.optionGroups[0])
        XCTAssertTrue(sel.isValid)
    }

    func testCartMergesLinesAndBuildsOrderInput() throws {
        let (p, m, paratha) = try karak()
        var cart = Cart()
        let merchant = CartMerchant(summary: m)
        var sel = ProductSelection(product: p)
        sel.toggle(p.optionGroups[0].options[1], in: p.optionGroups[0])

        XCTAssertEqual(cart.add(sel, quantity: 1, notes: nil, merchant: merchant), .added)
        XCTAssertEqual(cart.add(sel, quantity: 2, notes: "  ", merchant: merchant), .added)
        XCTAssertEqual(cart.lines.count, 1, "same product+options+notes merge")
        XCTAssertEqual(cart.lines[0].quantity, 3)
        cart.add(sel, quantity: 1, notes: "no sugar", merchant: merchant)
        XCTAssertEqual(cart.lines.count, 2)

        // Stock-tracked product is capped at stockQty (3).
        cart.add(ProductSelection(product: paratha), quantity: 10, notes: nil, merchant: merchant)
        XCTAssertEqual(cart.lines[2].quantity, 3)

        XCTAssertEqual(cart.subtotalBaisa, 600 * 4 + 500 * 3)
        XCTAssertEqual(cart.itemCount, 7)
        XCTAssertTrue(cart.meetsMinimumOrder)
        XCTAssertEqual(cart.allowedPaymentMethods, [.online, .cod])

        let input = try XCTUnwrap(cart.orderInput(addressId: "addr-1", paymentMethod: .cod))
        XCTAssertEqual(input.merchantId, m.id)
        XCTAssertEqual(input.items.count, 3)
        XCTAssertEqual(input.items[0].optionIds, ["o-l"])
        XCTAssertEqual(input.items[1].notes, "no sugar")
        XCTAssertNil(input.dropoff)
        XCTAssertEqual(input.source, "app")

        cart.setQuantity(0, forLine: cart.lines[0].id)
        XCTAssertEqual(cart.lines.count, 2)
    }

    func testSingleMerchantRule() throws {
        let (p, m, _) = try karak()
        var cart = Cart()
        cart.add(ProductSelection(product: p), quantity: 1, notes: nil, merchant: CartMerchant(summary: m))

        var other = m
        other.id = "other-merchant"
        let otherMerchant = CartMerchant(summary: other)
        XCTAssertTrue(cart.wouldConflict(with: other.id))
        XCTAssertEqual(cart.add(ProductSelection(product: p), quantity: 1, notes: nil, merchant: otherMerchant),
                       .differentMerchant(currentMerchantId: m.id))
        XCTAssertEqual(cart.merchant?.id, m.id, "nothing changes without explicit replace")

        cart.add(ProductSelection(product: p), quantity: 2, notes: nil, merchant: otherMerchant, replacingOtherMerchant: true)
        XCTAssertEqual(cart.merchant?.id, "other-merchant")
        XCTAssertEqual(cart.itemCount, 2)

        cart.clear()
        XCTAssertNil(cart.merchant)
        XCTAssertNil(cart.orderInput(addressId: nil, paymentMethod: .cod))
    }

    func testCartPersistsAsJSON() throws {
        let (p, m, _) = try karak()
        var cart = Cart()
        cart.add(ProductSelection(product: p), quantity: 2, notes: "hot", merchant: CartMerchant(summary: m))
        let restored = try JSONDecoder().decode(Cart.self, from: JSONEncoder().encode(cart))
        XCTAssertEqual(restored, cart)
    }

    func testOrderCancellability() throws {
        let base = try decodeFixture(Order.self, "order")
        var o = base
        o.status = .placed
        XCTAssertTrue(o.isCancellable)
        o.status = .accepted
        XCTAssertFalse(o.isCancellable, "marketplace: only before merchant accepts")
        o.type = .c2c
        o.delivery?.status = .assigned
        XCTAssertTrue(o.isCancellable, "c2c: before pickup")
        o.delivery?.status = .pickedUp
        XCTAssertFalse(o.isCancellable)
        o.status = .delivered
        XCTAssertTrue(o.canRate)
        o.rated = true
        XCTAssertFalse(o.canRate)
    }
}
