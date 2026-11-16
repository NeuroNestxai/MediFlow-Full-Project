import Foundation

/// Runtime configuration. The API base URL comes from the Info.plist key
/// `QABNAH_API_BASE_URL` (set per build configuration in project.yml), defaulting to the
/// local docker-compose backend.
public struct AppConfig: Sendable, Hashable {
    public static let infoPlistKey = "QABNAH_API_BASE_URL"
    public static let defaultBaseURL = URL(string: "http://localhost:4000/v1")!

    /// e.g. `http://localhost:4000/v1` (no trailing slash).
    public let baseURL: URL

    public init(baseURL: URL) {
        let s = baseURL.absoluteString
        self.baseURL = s.hasSuffix("/") ? URL(string: String(s.dropLast()))! : baseURL
    }

    /// Reads `QABNAH_API_BASE_URL` from the bundle's Info.plist. Unset, empty or unexpanded
    /// (`$(QABNAH_API_BASE_URL)`) values fall back to `defaultBaseURL`.
    public static func fromBundle(_ bundle: Bundle = .main) -> AppConfig {
        let raw = bundle.object(forInfoDictionaryKey: infoPlistKey) as? String
        return AppConfig(baseURL: parse(raw) ?? defaultBaseURL)
    }

    static func parse(_ raw: String?) -> URL? {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty, !raw.contains("$("),
              let url = URL(string: raw), let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https", url.host != nil else { return nil }
        return url
    }

    /// `ws(s)://host:port/v1/realtime`
    public var realtimeURL: URL {
        var c = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        c.scheme = (c.scheme?.lowercased() == "https") ? "wss" : "ws"
        c.path = (c.path.hasSuffix("/") ? String(c.path.dropLast()) : c.path) + "/realtime"
        return c.url!
    }

    /// Builds `baseURL + path` (path starts with `/`) with optional query items.
    public func url(path: String, query: [URLQueryItem] = []) -> URL {
        var c = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        let basePath = c.path.hasSuffix("/") ? String(c.path.dropLast()) : c.path
        c.path = basePath + (path.hasPrefix("/") ? path : "/" + path)
        let q = query.filter { $0.value != nil }
        c.queryItems = q.isEmpty ? nil : q
        // URLComponents leaves "+" unescaped in queries; servers decode it as a space.
        c.percentEncodedQuery = c.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        return c.url!
    }

    /// Resolves image/file URLs from the API, which may be absolute or server-relative
    /// (`/v1/files/…` or `files/…`).
    public func resolve(_ string: String?) -> URL? {
        guard let s = string?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
        if let u = URL(string: s), u.scheme != nil { return u }
        var c = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        if s.hasPrefix("/") {
            let parts = s.split(separator: "?", maxSplits: 1).map(String.init)
            c.path = parts[0]
            c.percentEncodedQuery = parts.count > 1 ? parts[1] : nil
            return c.url
        }
        return URL(string: s, relativeTo: baseURL.appendingPathComponent(""))?.absoluteURL
    }
}
