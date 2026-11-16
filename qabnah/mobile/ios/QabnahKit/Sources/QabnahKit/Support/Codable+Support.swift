import Foundation

// MARK: - JSONValue

/// Arbitrary JSON, used for contract fields typed as free-form objects
/// (`error.details`, `notification.data`, `zone.boundary`, realtime `data`, …).
public enum JSONValue: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let n = try? c.decode(Double.self) { self = .number(n); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSONValue].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON value")
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    public subscript(key: String) -> JSONValue? {
        if case .object(let o) = self { return o[key] }
        return nil
    }

    public var stringValue: String? {
        switch self {
        case .string(let s): return s
        case .number(let n): return n.rounded() == n ? String(Int(n)) : String(n)
        case .bool(let b): return b ? "true" : "false"
        default: return nil
        }
    }

    public var doubleValue: Double? {
        switch self {
        case .number(let n): return n
        case .string(let s): return Double(s)
        default: return nil
        }
    }

    /// Re-decodes this JSON value into a concrete type (used for realtime event payloads).
    public func decode<T: Decodable>(_ type: T.Type, decoder: JSONDecoder = .qabnah) throws -> T {
        let data = try JSONEncoder().encode(self)
        return try decoder.decode(T.self, from: data)
    }
}

// MARK: - Lenient enums

/// String enums that decode unknown server values to `unknownCase` instead of failing the
/// whole payload. The contract may grow new statuses; old app versions must keep working.
public protocol LenientStringEnum: RawRepresentable, Codable, Hashable, Sendable, CaseIterable where RawValue == String {
    static var unknownCase: Self { get }
}

public extension LenientStringEnum {
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? Self.unknownCase
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(rawValue)
    }

    /// All cases except the `unknown` sentinel — handy for pickers.
    static var knownCases: [Self] { allCases.filter { $0 != unknownCase } }
}

// MARK: - Defaulted properties

/// `[T]` that decodes to `[]` when the key is missing or `null`.
@propertyWrapper
public struct DefaultEmpty<T: Codable & Hashable>: Codable, Hashable {
    public var wrappedValue: [T]
    public init(wrappedValue: [T] = []) { self.wrappedValue = wrappedValue }
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        wrappedValue = c.decodeNil() ? [] : try c.decode([T].self)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(wrappedValue)
    }
}
extension DefaultEmpty: Sendable where T: Sendable {}

/// `Int` that decodes to `0` when missing or `null` (money / counters).
@propertyWrapper
public struct DefaultZero: Codable, Hashable, Sendable {
    public var wrappedValue: Int
    public init(wrappedValue: Int = 0) { self.wrappedValue = wrappedValue }
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { wrappedValue = 0; return }
        if let i = try? c.decode(Int.self) { wrappedValue = i; return }
        // Some serializers send integral numbers as 12.0
        wrappedValue = Int(try c.decode(Double.self).rounded())
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(wrappedValue)
    }
}

/// `Double` that decodes to `0` when missing or `null` (ratings).
@propertyWrapper
public struct DefaultZeroDouble: Codable, Hashable, Sendable {
    public var wrappedValue: Double
    public init(wrappedValue: Double = 0) { self.wrappedValue = wrappedValue }
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        wrappedValue = c.decodeNil() ? 0 : try c.decode(Double.self)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(wrappedValue)
    }
}

/// `Bool` that decodes to `false` when missing or `null`.
@propertyWrapper
public struct DefaultFalse: Codable, Hashable, Sendable {
    public var wrappedValue: Bool
    public init(wrappedValue: Bool = false) { self.wrappedValue = wrappedValue }
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        wrappedValue = c.decodeNil() ? false : try c.decode(Bool.self)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(wrappedValue)
    }
}

/// `String` that decodes to `""` when missing or `null`.
@propertyWrapper
public struct DefaultEmptyString: Codable, Hashable, Sendable {
    public var wrappedValue: String
    public init(wrappedValue: String = "") { self.wrappedValue = wrappedValue }
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        wrappedValue = c.decodeNil() ? "" : try c.decode(String.self)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(wrappedValue)
    }
}

public extension KeyedDecodingContainer {
    func decode<T>(_ type: DefaultEmpty<T>.Type, forKey key: Key) throws -> DefaultEmpty<T> {
        try decodeIfPresent(type, forKey: key) ?? DefaultEmpty()
    }
    func decode(_ type: DefaultZero.Type, forKey key: Key) throws -> DefaultZero {
        try decodeIfPresent(type, forKey: key) ?? DefaultZero()
    }
    func decode(_ type: DefaultZeroDouble.Type, forKey key: Key) throws -> DefaultZeroDouble {
        try decodeIfPresent(type, forKey: key) ?? DefaultZeroDouble()
    }
    func decode(_ type: DefaultFalse.Type, forKey key: Key) throws -> DefaultFalse {
        try decodeIfPresent(type, forKey: key) ?? DefaultFalse()
    }
    func decode(_ type: DefaultEmptyString.Type, forKey key: Key) throws -> DefaultEmptyString {
        try decodeIfPresent(type, forKey: key) ?? DefaultEmptyString()
    }
}

// MARK: - Coders

public enum ISO8601 {
    // ISO8601DateFormatter is documented as thread-safe.
    static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    public static func parse(_ s: String) -> Date? {
        fractional.date(from: s) ?? plain.date(from: s)
    }

    public static func string(from date: Date) -> String {
        fractional.string(from: date)
    }
}

public extension JSONDecoder {
    /// Decoder configured for the Qabnah API (ISO-8601 date-times with or without fractional seconds).
    static var qabnah: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            if let date = ISO8601.parse(s) { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Invalid ISO-8601 date: \(s)")
        }
        return d
    }
}

public extension JSONEncoder {
    static var qabnah: JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(ISO8601.string(from: date))
        }
        e.outputFormatting = [.sortedKeys]
        return e
    }
}

/// Type-erased `Encodable` so endpoints can carry any request body.
public struct AnyEncodable: Encodable {
    private let encodeFn: (Encoder) throws -> Void
    public init<T: Encodable>(_ value: T) { encodeFn = value.encode }
    public func encode(to encoder: Encoder) throws { try encodeFn(encoder) }
}
