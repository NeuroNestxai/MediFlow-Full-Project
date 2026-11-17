import SwiftUI
import QabnahKit

/// In-app language (ar/en) with runtime switching. Views read strings through `t(_:)` so a
/// toggle re-renders immediately without relaunching.
@MainActor
final class LanguageSettings: ObservableObject {
    private static let storageKey = "qabnah.language"

    @Published var language: AppLanguage {
        didSet {
            guard language != oldValue else { return }
            localizer = Localizer(language: language)
            UserDefaults.standard.set(language.rawValue, forKey: Self.storageKey)
            // So system-provided strings (permission alerts, share sheets) follow on next launch.
            UserDefaults.standard.set([language.rawValue], forKey: "AppleLanguages")
            onChange?(language)
        }
    }

    private(set) var localizer: Localizer
    var onChange: ((AppLanguage) -> Void)?

    /// The saved language (before any `LanguageSettings` instance exists, e.g. in `App.init`).
    static var storedLanguage: AppLanguage {
        UserDefaults.standard.string(forKey: storageKey).flatMap(AppLanguage.init(rawValue:)) ?? .default
    }

    init() {
        let lang = Self.storedLanguage
        language = lang
        localizer = Localizer(language: lang)
    }

    var layoutDirection: LayoutDirection { language.isRTL ? .rightToLeft : .leftToRight }
    var locale: Locale { language.locale }

    func t(_ key: String) -> String { localizer.string(key) }

    /// Lookup for keys built from server values (statuses, ledger entry types…); falls back to a
    /// humanized version of the raw value when the key isn't translated.
    func t(_ key: String, fallback: String) -> String {
        let s = localizer.string(key)
        guard s == key else { return s }
        return fallback.replacingOccurrences(of: "_", with: " ").capitalized
    }

    func f(_ key: String, _ args: CVarArg...) -> String { localizer.format(key, arguments: args) }

    func money(_ baisa: Int) -> String { Money.format(baisa: baisa, language: language) }

    func distance(_ meters: Int) -> String { Formatters.distance(meters: meters, language: language) }

    func minutes(_ seconds: Int) -> String { Formatters.minutes(seconds: seconds, language: language) }

    func dateTime(_ date: Date) -> String { Formatters.dateTime(date, language: language) }

    func time(_ date: Date) -> String { Formatters.time(date, language: language) }

    func digits(_ s: String) -> String { Digits.localized(s, language) }

    func name(_ item: BilingualNamed) -> String { item.name(language) }

    /// User-facing copy for any error thrown by the API layer.
    func errorMessage(_ error: Error) -> String {
        if let keyed = error as? LocalizedKeyError { return t(keyed.key) }
        guard let api = error as? APIError else { return t("error.generic") }
        switch api {
        case .network: return t("error.network")
        case .unauthorized: return t("error.unauthorized")
        case .decoding: return t("error.decoding")
        case .cancelled: return t("error.generic")
        default: break
        }
        if api.isRateLimited { return t("error.rate_limited") }
        if let code = api.code {
            let key = "error.\(code)"
            let localized = t(key)
            if localized != key { return localized }
        }
        return api.serverMessage ?? t("error.generic")
    }
}

/// Client-side error whose message is a localization key.
struct LocalizedKeyError: Error {
    let key: String
}

/// State of a screen's primary data.
enum Loadable<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(Error)

    var value: Value? {
        if case .loaded(let v) = self { return v }
        return nil
    }

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }
}
