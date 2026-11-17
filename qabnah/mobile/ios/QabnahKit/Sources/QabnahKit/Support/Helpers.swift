import Foundation

// MARK: - Phone numbers

public enum PhoneNumber {
    /// Normalizes user input into Omani E.164 (`+968XXXXXXXX`). Accepts local 8-digit numbers,
    /// `968…`, `00968…`, `+968…`, spaces/dashes and Arabic-Indic digits.
    /// Returns nil unless the result is an Omani mobile (8 digits starting with 7 or 9).
    public static func normalizeOmaniMobile(_ input: String) -> String? {
        let digits = Digits.ascii(input).filter(\.isNumber)
        var local = digits
        if local.hasPrefix("00968") { local = String(local.dropFirst(5)) }
        else if local.hasPrefix("968") && local.count == 11 { local = String(local.dropFirst(3)) }
        guard local.count == 8, let first = local.first, first == "9" || first == "7" else { return nil }
        return "+968" + local
    }

    /// Digits only, for `wa.me` links (`+968 9123 4567` → `96891234567`).
    public static func waDigits(_ phone: String) -> String {
        var d = Digits.ascii(phone).filter(\.isNumber)
        if d.hasPrefix("00") { d = String(d.dropFirst(2)) }
        if d.count == 8 { d = "968" + d }
        return d
    }

    /// `+968 9123 4567`
    public static func display(_ e164: String) -> String {
        guard e164.hasPrefix("+968"), e164.count == 12 else { return e164 }
        let local = e164.dropFirst(4)
        return "+968 \(local.prefix(4)) \(local.suffix(4))"
    }
}

// MARK: - External links (calls, WhatsApp, navigation apps)

public enum ExternalLinks {
    public static func tel(_ phone: String) -> URL? {
        let cleaned = Digits.ascii(phone).filter { $0.isNumber || $0 == "+" }
        guard !cleaned.isEmpty else { return nil }
        return URL(string: "tel:\(cleaned)")
    }

    /// `https://wa.me/<digits>`
    public static func whatsApp(_ phone: String, text: String? = nil) -> URL? {
        let d = PhoneNumber.waDigits(phone)
        guard !d.isEmpty else { return nil }
        var c = URLComponents(string: "https://wa.me/\(d)")
        if let text, !text.isEmpty { c?.queryItems = [URLQueryItem(name: "text", value: text)] }
        return c?.url
    }

    public enum NavigationApp: String, CaseIterable, Sendable {
        case appleMaps, googleMaps, waze
    }

    /// Deep link that opens the app (custom schemes need `LSApplicationQueriesSchemes`).
    public static func navigation(_ app: NavigationApp, to dest: LatLng) -> URL? {
        let ll = "\(dest.lat),\(dest.lng)"
        switch app {
        case .appleMaps: return URL(string: "http://maps.apple.com/?daddr=\(ll)&dirflg=d")
        case .googleMaps: return URL(string: "comgooglemaps://?daddr=\(ll)&directionsmode=driving")
        case .waze: return URL(string: "waze://?ll=\(ll)&navigate=yes")
        }
    }

    /// Web fallback when the app isn't installed.
    public static func navigationWebFallback(_ app: NavigationApp, to dest: LatLng) -> URL? {
        let ll = "\(dest.lat),\(dest.lng)"
        switch app {
        case .appleMaps: return navigation(.appleMaps, to: dest)
        case .googleMaps: return URL(string: "https://www.google.com/maps/dir/?api=1&destination=\(ll)&travelmode=driving")
        case .waze: return URL(string: "https://waze.com/ul?ll=\(ll)&navigate=yes")
        }
    }
}

// MARK: - Muscat calendar & date ranges

public enum MuscatCalendar {
    public static let timeZone = TimeZone(identifier: "Asia/Muscat") ?? TimeZone(secondsFromGMT: 4 * 3600)!

    public static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        c.firstWeekday = 1 // Sunday — Oman's week starts on Sunday
        c.locale = Locale(identifier: "en_US_POSIX")
        return c
    }

    /// `YYYY-MM-DD` in Muscat time.
    public static func dayString(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    public static func date(fromDay day: String) -> Date? {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: day)
    }
}

/// Earnings period presets (`from`/`to` inclusive dates, Muscat time).
public enum DateRangePreset: String, CaseIterable, Identifiable, Sendable {
    case today, week, month

    public var id: String { rawValue }

    public func range(now: Date = Date()) -> (from: String, to: String) {
        let cal = MuscatCalendar.calendar
        let start: Date
        switch self {
        case .today:
            start = cal.startOfDay(for: now)
        case .week:
            start = cal.dateInterval(of: .weekOfYear, for: now)?.start ?? cal.startOfDay(for: now)
        case .month:
            start = cal.dateInterval(of: .month, for: now)?.start ?? cal.startOfDay(for: now)
        }
        return (MuscatCalendar.dayString(start), MuscatCalendar.dayString(now))
    }
}

// MARK: - Backoff

/// Exponential backoff with full jitter, used by the realtime reconnect loop.
public struct Backoff: Sendable {
    public var base: TimeInterval
    public var max: TimeInterval
    public private(set) var attempt: Int = 0

    public init(base: TimeInterval = 1, max: TimeInterval = 30) {
        self.base = base
        self.max = max
    }

    /// Upper bound of the delay for the current attempt (without jitter).
    public var currentCeiling: TimeInterval {
        Swift.min(max, base * pow(2, Double(attempt)))
    }

    /// Returns the next delay and advances. `random` is injectable for tests.
    public mutating func next(random: (ClosedRange<Double>) -> Double = { Double.random(in: $0) }) -> TimeInterval {
        let ceiling = currentCeiling
        attempt += 1
        // Never less than half the ceiling so we don't hammer the server.
        return random((ceiling / 2)...ceiling)
    }

    public mutating func reset() { attempt = 0 }
}

// MARK: - Personal data export

/// Helpers for `GET /me/export` (PDPL access right): the app saves the JSON to a file and
/// hands it to the share sheet.
public enum DataExport {
    /// `qabnah-consumer-data-2026-11-17.json` (date in Muscat time).
    public static func fileName(app: ClientApp, date: Date = Date()) -> String {
        "qabnah-\(app.rawValue)-data-\(MuscatCalendar.dayString(date)).json"
    }

    /// Pretty-printed copy of the export for humans; the original bytes if it isn't valid JSON.
    public static func prettyPrinted(_ data: Data) -> Data {
        guard let object = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]),
              JSONSerialization.isValidJSONObject(object),
              let pretty = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
        else { return data }
        return pretty
    }

    /// Writes the export to a fresh temporary file and returns its URL.
    public static func write(_ data: Data, app: ClientApp, date: Date = Date(),
                             directory: URL = FileManager.default.temporaryDirectory) throws -> URL {
        let url = directory.appendingPathComponent(fileName(app: app, date: date))
        try prettyPrinted(data).write(to: url, options: [.atomic])
        return url
    }
}
