import Foundation

/// The two languages Qabnah ships. Arabic is the default (Arabic-first, RTL).
public enum AppLanguage: String, Codable, CaseIterable, Identifiable, Sendable {
    case ar, en

    public var id: String { rawValue }
    public var isRTL: Bool { self == .ar }
    public var localeIdentifier: String { self == .ar ? "ar_OM" : "en_OM" }
    public var locale: Locale { Locale(identifier: localeIdentifier) }

    /// Name of the language written in itself (for the toggle).
    public var endonym: String { self == .ar ? "العربية" : "English" }

    public static let `default`: AppLanguage = .ar

    /// Value for the `Accept-Language` request header.
    public var acceptLanguage: String { self == .ar ? "ar, en;q=0.5" : "en, ar;q=0.5" }
}

/// Anything with `nameEn` / `nameAr` (merchants, products, zones…).
public protocol BilingualNamed {
    var nameEn: String { get }
    var nameAr: String { get }
}

public extension BilingualNamed {
    /// Name in the requested language, falling back to the other one when blank.
    func name(_ language: AppLanguage) -> String {
        let preferred = language == .ar ? nameAr : nameEn
        let fallback = language == .ar ? nameEn : nameAr
        return preferred.trimmingCharacters(in: .whitespaces).isEmpty ? fallback : preferred
    }
}

/// String lookup against a specific `.lproj` inside a bundle, so the app can switch language
/// at runtime without relaunching (the system lookup follows the device language only).
public struct Localizer: Sendable {
    public let language: AppLanguage
    private let bundlePath: String?
    private let tableName: String?

    public init(language: AppLanguage, bundle: Bundle = .main, tableName: String? = nil) {
        self.language = language
        self.bundlePath = bundle.path(forResource: language.rawValue, ofType: "lproj")
            ?? bundle.path(forResource: language == .ar ? "ar" : "en", ofType: "lproj")
        self.tableName = tableName
    }

    /// Localized string for `key`; returns the key itself when missing (easy to spot in QA).
    public func string(_ key: String) -> String {
        guard let path = bundlePath, let b = Bundle(path: path) else { return key }
        return b.localizedString(forKey: key, value: key, table: tableName)
    }

    /// Localized format string with `%@` / `%d` arguments. Numbers in Arabic are rendered
    /// with Arabic-Indic digits.
    public func format(_ key: String, _ args: CVarArg...) -> String {
        format(key, arguments: args)
    }

    public func format(_ key: String, arguments: [CVarArg]) -> String {
        let s = String(format: string(key), locale: Locale(identifier: "en_US_POSIX"), arguments: arguments)
        return language == .ar ? Digits.arabicIndic(s) : s
    }
}

public enum Digits {
    private static let arabic: [Character] = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]

    /// Replaces ASCII digits with Arabic-Indic digits (U+0660…U+0669).
    public static func arabicIndic(_ s: String) -> String {
        String(s.map { ch -> Character in
            if let v = ch.wholeNumberValue, ch.isASCII { return arabic[v] }
            return ch
        })
    }

    /// Replaces Arabic-Indic and Eastern Arabic-Indic (Persian) digits with ASCII digits.
    /// Used on user input (phone numbers, PINs, amounts typed with an Arabic keyboard).
    public static func ascii(_ s: String) -> String {
        String(s.map { ch -> Character in
            guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return ch }
            switch scalar.value {
            case 0x0660...0x0669: return Character(String(scalar.value - 0x0660))
            case 0x06F0...0x06F9: return Character(String(scalar.value - 0x06F0))
            case 0x066B: return "." // Arabic decimal separator
            case 0x066C: return "," // Arabic thousands separator
            default: return ch
            }
        })
    }

    public static func localized(_ s: String, _ language: AppLanguage) -> String {
        language == .ar ? arabicIndic(s) : s
    }
}
