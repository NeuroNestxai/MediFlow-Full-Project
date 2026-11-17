import XCTest
@testable import QabnahKit

/// Helpers that exist for the UI (price parts for `QPrice`, daily totals for the earnings chart).
final class DesignSupportTests: XCTestCase {
    func testMoneyPartsMatchFormat() {
        for baisa in [0, 5, 750, 2500, 1_234_500, -750, -12_950] {
            for language in AppLanguage.allCases {
                let p = Money.parts(baisa: baisa, language: language)
                let joined = p.currencyLeads ? "\(p.currency) \(p.amount)" : "\(p.amount) \(p.currency)"
                // The English format puts the minus sign before the currency; compare without it there.
                let expected = Money.format(baisa: baisa, language: language)
                if language == .en && baisa < 0 {
                    XCTAssertEqual("-" + joined.replacingOccurrences(of: "-", with: ""), expected)
                } else {
                    XCTAssertEqual(joined, expected)
                }
            }
        }
    }

    func testMoneyPartsValues() {
        let en = Money.parts(baisa: 1_234_500, language: .en)
        XCTAssertEqual(en.amount, "1,234.500")
        XCTAssertEqual(en.currency, "OMR")
        XCTAssertTrue(en.currencyLeads)
        let ar = Money.parts(baisa: 2500, language: .ar)
        XCTAssertEqual(ar.amount, "٢٫٥٠٠")
        XCTAssertEqual(ar.currency, "ر.ع.")
        XCTAssertFalse(ar.currencyLeads)
        XCTAssertEqual(Money.parts(baisa: -750, language: .en).amount, "-0.750")
    }

    func testDailyEarningsFillsRangeAndIgnoresNonIncome() throws {
        let json = """
        {"from":"2026-11-14","to":"2026-11-16","deliveriesCount":3,"earningsBaisa":2100,"codCollectedBaisa":2600,"balanceBaisa":-500,
         "entries":[
          {"id":1,"entryType":"captain_earning","amountBaisa":650,"description":"a","createdAt":"2026-11-16T10:06:00Z"},
          {"id":2,"entryType":"cod_collected","amountBaisa":-2600,"description":"b","createdAt":"2026-11-16T10:06:00Z"},
          {"id":3,"entryType":"tip","amountBaisa":200,"description":"c","createdAt":"2026-11-16T11:00:00Z"},
          {"id":4,"entryType":"captain_earning","amountBaisa":1250,"description":"d","createdAt":"2026-11-13T21:30:00Z"},
          {"id":5,"entryType":"payout","amountBaisa":-900,"description":"e","createdAt":"2026-11-15T09:00:00Z"},
          {"id":6,"entryType":"captain_earning","amountBaisa":100,"description":"no date"}
         ]}
        """
        let e = try JSONDecoder.qabnah.decode(Earnings.self, from: Data(json.utf8))
        let days = e.dailyEarnings()
        // 21:30Z on the 13th is 01:30 on the 14th in Muscat.
        XCTAssertEqual(days.map(\.day), ["2026-11-14", "2026-11-15", "2026-11-16"])
        XCTAssertEqual(days.map(\.baisa), [1250, 0, 850])
    }

    func testDailyEarningsWithoutRange() throws {
        let e = try decodeFixture(Earnings.self, "earnings")
        XCTAssertEqual(e.dailyEarnings(), [Earnings.DayTotal(day: "2026-11-16", baisa: 650)])
        var empty = e
        empty.entries = []
        empty.from = nil
        empty.to = nil
        XCTAssertEqual(empty.dailyEarnings(), [])
    }
}
