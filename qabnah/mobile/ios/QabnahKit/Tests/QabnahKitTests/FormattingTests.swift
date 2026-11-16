import XCTest
@testable import QabnahKit

final class MoneyTests: XCTestCase {
    func testEnglishFormatting() {
        XCTAssertEqual(Money.format(baisa: 2500, language: .en), "OMR 2.500")
        XCTAssertEqual(Money.format(baisa: 0, language: .en), "OMR 0.000")
        XCTAssertEqual(Money.format(baisa: 5, language: .en), "OMR 0.005")
        XCTAssertEqual(Money.format(baisa: 1_234_500, language: .en), "OMR 1,234.500")
        XCTAssertEqual(Money.format(baisa: -750, language: .en), "-OMR 0.750")
    }

    func testArabicFormatting() {
        XCTAssertEqual(Money.format(baisa: 2500, language: .ar), "٢٫٥٠٠ ر.ع.")
        XCTAssertEqual(Money.format(baisa: 1_234_500, language: .ar), "١٬٢٣٤٫٥٠٠ ر.ع.")
        XCTAssertEqual(Money.format(baisa: -750, language: .ar), "\u{200F}-٠٫٧٥٠ ر.ع.")
    }

    func testDecimalString() {
        XCTAssertEqual(Money.decimalString(baisa: 2600), "2.600")
        XCTAssertEqual(Money.decimalString(baisa: 2600, language: .ar), "٢٫٦٠٠")
    }

    func testParse() {
        XCTAssertEqual(Money.parse("2.5"), 2500)
        XCTAssertEqual(Money.parse("2.500"), 2500)
        XCTAssertEqual(Money.parse("3"), 3000)
        XCTAssertEqual(Money.parse(".75"), 750)
        XCTAssertEqual(Money.parse("1,234.005"), 1_234_005)
        XCTAssertEqual(Money.parse("٢٫٥"), 2500)
        XCTAssertEqual(Money.parse("OMR 2.600"), 2600)
        XCTAssertEqual(Money.parse("-1"), -1000)
        XCTAssertNil(Money.parse(""))
        XCTAssertNil(Money.parse("2.5555"))
        XCTAssertNil(Money.parse("abc"))
        XCTAssertNil(Money.parse("1.2.3"))
    }

    func testRoundTripAllSmallAmounts() {
        for b in stride(from: 0, through: 20_000, by: 7) {
            XCTAssertEqual(Money.parse(Money.decimalString(baisa: b)), b)
            XCTAssertEqual(Money.parse(Money.decimalString(baisa: b, language: .ar)), b)
        }
    }
}

final class FormattersTests: XCTestCase {
    func testDistance() {
        XCTAssertEqual(Formatters.distance(meters: 850, language: .en), "850 m")
        XCTAssertEqual(Formatters.distance(meters: 2400, language: .en), "2.4 km")
        XCTAssertEqual(Formatters.distance(meters: 15000, language: .en), "15 km")
        XCTAssertEqual(Formatters.distance(meters: 2400, language: .ar), "٢٫٤ كم")
        XCTAssertEqual(Formatters.distance(meters: 850, language: .ar), "٨٥٠ م")
    }

    func testMinutesAndCountdown() {
        XCTAssertEqual(Formatters.minutes(seconds: 1260, language: .en), "21 min")
        XCTAssertEqual(Formatters.minutes(seconds: 10, language: .en), "1 min")
        XCTAssertEqual(Formatters.countdown(seconds: 75, language: .en), "1:15")
        XCTAssertEqual(Formatters.countdown(seconds: 75, language: .ar), "١:١٥")
        let now = Date()
        XCTAssertEqual(Formatters.minutesUntil(now.addingTimeInterval(600), now: now), 10)
        XCTAssertNil(Formatters.minutesUntil(now.addingTimeInterval(-5), now: now))
        XCTAssertEqual(Formatters.rating(4.75, language: .en), "4.8")
    }

    func testDigits() {
        XCTAssertEqual(Digits.ascii("٩١٢٣٤٥٦٧"), "91234567")
        XCTAssertEqual(Digits.ascii("۴۸۲۱"), "4821")
        XCTAssertEqual(Digits.arabicIndic("QB100001"), "QB١٠٠٠٠١")
    }

    func testBilingualFallback() throws {
        let sf = try decodeFixture(Storefront.self, "storefront")
        var zone = try JSONDecoder.qabnah.decode(Zone.self, from: Data(#"{"id":"z","nameEn":"Seeb","nameAr":""}"#.utf8))
        XCTAssertEqual(zone.name(.ar), "Seeb", "falls back to English when Arabic is blank")
        zone.nameAr = "السيب"
        XCTAssertEqual(zone.name(.ar), "السيب")
        XCTAssertEqual(sf.merchant.summary.tagline(.ar), "كرك مسقط المفضل")
    }
}

final class HelpersTests: XCTestCase {
    func testPhoneNormalization() {
        XCTAssertEqual(PhoneNumber.normalizeOmaniMobile("9123 4567"), "+96891234567")
        XCTAssertEqual(PhoneNumber.normalizeOmaniMobile("+968 9123-4567"), "+96891234567")
        XCTAssertEqual(PhoneNumber.normalizeOmaniMobile("0096871234567"), "+96871234567")
        XCTAssertEqual(PhoneNumber.normalizeOmaniMobile("96891234567"), "+96891234567")
        XCTAssertEqual(PhoneNumber.normalizeOmaniMobile("٩١٢٣٤٥٦٧"), "+96891234567")
        XCTAssertNil(PhoneNumber.normalizeOmaniMobile("24123456"), "landlines are not mobiles")
        XCTAssertNil(PhoneNumber.normalizeOmaniMobile("912345"))
        XCTAssertEqual(PhoneNumber.display("+96891234567"), "+968 9123 4567")
    }

    func testExternalLinks() {
        XCTAssertEqual(ExternalLinks.whatsApp("+968 9123 4567")?.absoluteString, "https://wa.me/96891234567")
        XCTAssertEqual(ExternalLinks.whatsApp("91234567")?.absoluteString, "https://wa.me/96891234567")
        XCTAssertEqual(ExternalLinks.tel("+968 9123 4567")?.absoluteString, "tel:+96891234567")
        let dest = LatLng(lat: 23.61, lng: 58.45)
        XCTAssertEqual(ExternalLinks.navigation(.appleMaps, to: dest)?.absoluteString,
                       "http://maps.apple.com/?daddr=23.61,58.45&dirflg=d")
        XCTAssertEqual(ExternalLinks.navigation(.googleMaps, to: dest)?.absoluteString,
                       "comgooglemaps://?daddr=23.61,58.45&directionsmode=driving")
        XCTAssertEqual(ExternalLinks.navigation(.waze, to: dest)?.absoluteString,
                       "waze://?ll=23.61,58.45&navigate=yes")
        XCTAssertEqual(ExternalLinks.navigationWebFallback(.waze, to: dest)?.absoluteString,
                       "https://waze.com/ul?ll=23.61,58.45&navigate=yes")
    }

    func testDateRangePresets() throws {
        // Wednesday 2026-11-18 21:30 UTC == Thursday 2026-11-19 01:30 in Muscat (UTC+4).
        let now = try XCTUnwrap(ISO8601.parse("2026-11-18T21:30:00Z"))
        XCTAssertEqual(DateRangePreset.today.range(now: now).from, "2026-11-19")
        XCTAssertEqual(DateRangePreset.today.range(now: now).to, "2026-11-19")
        XCTAssertEqual(DateRangePreset.week.range(now: now).from, "2026-11-15", "Omani week starts Sunday")
        XCTAssertEqual(DateRangePreset.month.range(now: now).from, "2026-11-01")
    }

    func testAvailabilitySlot() {
        XCTAssertTrue(AvailabilitySlot(weekday: 0, start: "08:00", end: "14:00").isValid)
        XCTAssertFalse(AvailabilitySlot(weekday: 0, start: "14:00", end: "08:00").isValid)
        XCTAssertFalse(AvailabilitySlot(weekday: 7, start: "08:00", end: "14:00").isValid)
        XCTAssertTrue(AvailabilitySlot(weekday: 6, start: "18:00", end: "24:00").isValid)
        XCTAssertEqual(AvailabilitySlot.hhmm(510), "08:30")
    }

    func testBackoff() {
        var b = Backoff(base: 1, max: 30)
        let upper: (ClosedRange<Double>) -> Double = { $0.upperBound }
        XCTAssertEqual(b.next(random: upper), 1)
        XCTAssertEqual(b.next(random: upper), 2)
        XCTAssertEqual(b.next(random: upper), 4)
        XCTAssertEqual(b.next(random: upper), 8)
        XCTAssertEqual(b.next(random: upper), 16)
        XCTAssertEqual(b.next(random: upper), 30)
        XCTAssertEqual(b.next(random: upper), 30)
        XCTAssertEqual(b.next(random: { $0.lowerBound }), 15)
        b.reset()
        XCTAssertEqual(b.next(random: upper), 1)
    }

    func testAppConfig() {
        XCTAssertNil(AppConfig.parse("$(QABNAH_API_BASE_URL)"))
        XCTAssertNil(AppConfig.parse(""))
        XCTAssertNil(AppConfig.parse("ftp://x"))
        let cfg = AppConfig(baseURL: AppConfig.parse("http://192.168.1.20:4000/v1/")!)
        XCTAssertEqual(cfg.baseURL.absoluteString, "http://192.168.1.20:4000/v1")
        XCTAssertEqual(cfg.realtimeURL.absoluteString, "ws://192.168.1.20:4000/v1/realtime")
        XCTAssertEqual(AppConfig(baseURL: URL(string: "https://api.qabnah.om/v1")!).realtimeURL.absoluteString,
                       "wss://api.qabnah.om/v1/realtime")
        XCTAssertEqual(cfg.url(path: "/stores", query: [URLQueryItem(name: "q", value: "karak+tea")]).absoluteString,
                       "http://192.168.1.20:4000/v1/stores?q=karak%2Btea")
        XCTAssertEqual(cfg.resolve("/v1/files/abc?sig=1&exp=2")?.absoluteString, "http://192.168.1.20:4000/v1/files/abc?sig=1&exp=2")
        XCTAssertEqual(cfg.resolve("https://cdn.test/a.png")?.absoluteString, "https://cdn.test/a.png")
        XCTAssertNil(cfg.resolve(nil))
        XCTAssertEqual(AppConfig.fromBundle(Bundle(for: HelpersTests.self)).baseURL, AppConfig.defaultBaseURL)
    }

    func testLocalizerFallsBackToKey() {
        let l = Localizer(language: .ar, bundle: Bundle(for: HelpersTests.self))
        XCTAssertEqual(l.string("missing.key"), "missing.key")
    }
}
