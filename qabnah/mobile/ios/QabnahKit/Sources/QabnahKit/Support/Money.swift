import Foundation

/// Money helpers. All amounts are integer **baisa** (1 OMR = 1000 baisa); never floats.
///
/// Display format (deterministic, independent of device ICU data):
/// - en: `OMR 2.500`, `OMR 1,234.500`, `-OMR 0.750`
/// - ar: `٢٫٥٠٠ ر.ع.`, `١٬٢٣٤٫٥٠٠ ر.ع.`, `-٠٫٧٥٠ ر.ع.`
public enum Money {
    public static let baisaPerRial = 1000

    public static func format(baisa: Int, language: AppLanguage) -> String {
        let negative = baisa < 0
        let magnitude = baisa.magnitude
        let rials = magnitude / UInt(baisaPerRial)
        let fraction = magnitude % UInt(baisaPerRial)

        let grouped = group(String(rials), separator: language == .ar ? "٬" : ",")
        let frac = String(format: "%03d", Int(fraction))
        let sign = negative ? "-" : ""

        switch language {
        case .en:
            return "\(sign)OMR \(grouped).\(frac)"
        case .ar:
            let number = Digits.arabicIndic("\(grouped)٫\(frac)")
            // U+200F (RLM) keeps the minus sign attached on the right in RTL layouts.
            return negative ? "\u{200F}-\(number) ر.ع." : "\(number) ر.ع."
        }
    }

    /// The pieces of a formatted price, for UIs that style the currency label separately
    /// (design system: amount bold with tabular numerals, currency smaller and muted).
    public struct Parts: Equatable, Sendable {
        /// `2.500`, `-0.750`, `١٬٢٣٤٫٥٠٠` — digits in the reader's language, sign included.
        public let amount: String
        /// `OMR` / `ر.ع.`
        public let currency: String
        /// True when the currency is written before the amount (English).
        public let currencyLeads: Bool
    }

    public static func parts(baisa: Int, language: AppLanguage) -> Parts {
        let negative = baisa < 0
        let magnitude = baisa.magnitude
        let rials = magnitude / UInt(baisaPerRial)
        let frac = String(format: "%03d", Int(magnitude % UInt(baisaPerRial)))
        switch language {
        case .en:
            let grouped = group(String(rials), separator: ",")
            return Parts(amount: "\(negative ? "-" : "")\(grouped).\(frac)", currency: "OMR", currencyLeads: true)
        case .ar:
            let number = Digits.arabicIndic("\(group(String(rials), separator: "٬"))٫\(frac)")
            return Parts(amount: negative ? "\u{200F}-\(number)" : number, currency: "ر.ع.", currencyLeads: false)
        }
    }

    /// Compact variant without currency, e.g. `2.500` / `٢٫٥٠٠` (for input fields).
    public static func decimalString(baisa: Int, language: AppLanguage = .en) -> String {
        let negative = baisa < 0
        let m = baisa.magnitude
        let s = "\(negative ? "-" : "")\(m / 1000).\(String(format: "%03d", Int(m % 1000)))"
        return language == .ar ? Digits.arabicIndic(s).replacingOccurrences(of: ".", with: "٫") : s
    }

    /// Parses a user-typed OMR amount ("2.5", "٢٫٥", "2,500.250", "3") into baisa.
    /// Returns nil for malformed input or more than 3 decimal places.
    public static func parse(_ text: String) -> Int? {
        var s = Digits.ascii(text).trimmingCharacters(in: .whitespacesAndNewlines)
        s = s.replacingOccurrences(of: "OMR", with: "")
            .replacingOccurrences(of: "ر.ع.", with: "")
            .replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty else { return nil }
        var negative = false
        if s.hasPrefix("-") { negative = true; s.removeFirst() }
        let parts = s.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count <= 2, let intPart = parts.first,
              !intPart.isEmpty || parts.count == 2,
              intPart.allSatisfy(\.isNumber) else { return nil }
        let rials = intPart.isEmpty ? 0 : Int(intPart) ?? -1
        guard rials >= 0 else { return nil }
        var baisa = rials * baisaPerRial
        if parts.count == 2 {
            let f = parts[1]
            guard f.count <= 3, f.allSatisfy(\.isNumber) else { return nil }
            let padded = f.padding(toLength: 3, withPad: "0", startingAt: 0)
            baisa += Int(padded) ?? 0
        }
        return negative ? -baisa : baisa
    }

    private static func group(_ digits: String, separator: String) -> String {
        var out: [Character] = []
        for (i, ch) in digits.reversed().enumerated() {
            if i > 0 && i % 3 == 0 { out.append(contentsOf: separator) }
            out.append(ch)
        }
        return String(out.reversed())
    }
}

/// Distance / duration / rating formatting shared by both apps.
public enum Formatters {
    /// `850 m`, `2.4 km` / `٨٥٠ م`, `٢٫٤ كم`
    public static func distance(meters: Int, language: AppLanguage) -> String {
        if meters < 1000 {
            let s = "\(max(0, meters))"
            return language == .ar ? "\(Digits.arabicIndic(s)) م" : "\(s) m"
        }
        let km = Double(meters) / 1000
        let s = km >= 10 ? String(format: "%.0f", km) : String(format: "%.1f", km)
        return language == .ar
            ? "\(Digits.arabicIndic(s).replacingOccurrences(of: ".", with: "٫")) كم"
            : "\(s) km"
    }

    /// Rounded minutes, at least 1: `12 min` / `١٢ د`
    public static func minutes(seconds: Int, language: AppLanguage) -> String {
        let m = max(1, Int((Double(seconds) / 60).rounded()))
        return language == .ar ? "\(Digits.arabicIndic(String(m))) د" : "\(m) min"
    }

    /// Minutes from `now` until `date` (nil if in the past).
    public static func minutesUntil(_ date: Date?, now: Date = Date()) -> Int? {
        guard let date else { return nil }
        let s = date.timeIntervalSince(now)
        guard s > 0 else { return nil }
        return max(1, Int((s / 60).rounded()))
    }

    /// `4.8`
    public static func rating(_ value: Double, language: AppLanguage) -> String {
        let s = String(format: "%.1f", value)
        return language == .ar ? Digits.arabicIndic(s).replacingOccurrences(of: ".", with: "٫") : s
    }

    /// `mm:ss` countdown.
    public static func countdown(seconds: Int, language: AppLanguage) -> String {
        let s = String(format: "%d:%02d", max(0, seconds) / 60, max(0, seconds) % 60)
        return Digits.localized(s, language)
    }

    /// Medium date + short time in Muscat time zone.
    public static func dateTime(_ date: Date, language: AppLanguage) -> String {
        let f = DateFormatter()
        f.locale = language.locale
        f.timeZone = MuscatCalendar.timeZone
        f.dateStyle = .medium
        f.timeStyle = .short
        return f.string(from: date)
    }

    public static func time(_ date: Date, language: AppLanguage) -> String {
        let f = DateFormatter()
        f.locale = language.locale
        f.timeZone = MuscatCalendar.timeZone
        f.dateStyle = .none
        f.timeStyle = .short
        return f.string(from: date)
    }
}
