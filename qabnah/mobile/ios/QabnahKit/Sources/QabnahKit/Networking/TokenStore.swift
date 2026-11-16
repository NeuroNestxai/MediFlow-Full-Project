import Foundation
#if canImport(Security)
import Security
#endif

/// Persisted session tokens.
public struct AuthTokens: Codable, Hashable, Sendable {
    public var accessToken: String
    public var refreshToken: String
    /// Absolute expiry of the access token, if the server told us `expiresIn`.
    public var accessTokenExpiresAt: Date?

    public init(accessToken: String, refreshToken: String, accessTokenExpiresAt: Date? = nil) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.accessTokenExpiresAt = accessTokenExpiresAt
    }

    public init(_ response: TokensResponse, now: Date = Date()) {
        self.accessToken = response.accessToken
        self.refreshToken = response.refreshToken
        self.accessTokenExpiresAt = response.expiresIn.map { now.addingTimeInterval(TimeInterval($0)) }
    }

    /// True when the access token expires within `leeway` seconds.
    public func isExpiring(within leeway: TimeInterval = 30, now: Date = Date()) -> Bool {
        guard let exp = accessTokenExpiresAt else { return false }
        return exp.timeIntervalSince(now) < leeway
    }
}

public protocol TokenStore: AnyObject, Sendable {
    func load() -> AuthTokens?
    func save(_ tokens: AuthTokens)
    func clear()
}

/// Volatile store (tests, previews, platforms without Keychain).
public final class InMemoryTokenStore: TokenStore, @unchecked Sendable {
    private let lock = NSLock()
    private var tokens: AuthTokens?

    public init(_ tokens: AuthTokens? = nil) { self.tokens = tokens }

    public func load() -> AuthTokens? {
        lock.lock(); defer { lock.unlock() }
        return tokens
    }

    public func save(_ tokens: AuthTokens) {
        lock.lock(); defer { lock.unlock() }
        self.tokens = tokens
    }

    public func clear() {
        lock.lock(); defer { lock.unlock() }
        tokens = nil
    }
}

#if canImport(Security)
/// Keychain-backed store (generic password, this-device-only, available after first unlock so
/// the captain app can refresh tokens while tracking in the background).
public final class KeychainTokenStore: TokenStore, @unchecked Sendable {
    private let service: String
    private let account: String
    private let lock = NSLock()
    private var cache: AuthTokens?
    private var loaded = false

    public init(service: String, account: String = "session") {
        self.service = service
        self.account = account
    }

    private var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    public func load() -> AuthTokens? {
        lock.lock(); defer { lock.unlock() }
        if loaded { return cache }
        var q = baseQuery
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        if status == errSecSuccess, let data = out as? Data {
            cache = try? JSONDecoder.qabnah.decode(AuthTokens.self, from: data)
        } else {
            cache = nil
        }
        loaded = true
        return cache
    }

    public func save(_ tokens: AuthTokens) {
        lock.lock(); defer { lock.unlock() }
        guard let data = try? JSONEncoder.qabnah.encode(tokens) else { return }
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemUpdate(baseQuery as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            var add = baseQuery
            attrs.forEach { add[$0.key] = $0.value }
            SecItemAdd(add as CFDictionary, nil)
        }
        cache = tokens
        loaded = true
    }

    public func clear() {
        lock.lock(); defer { lock.unlock() }
        SecItemDelete(baseQuery as CFDictionary)
        cache = nil
        loaded = true
    }
}
#endif

public enum TokenStores {
    /// Keychain where available, otherwise in-memory.
    public static func platformDefault(service: String) -> TokenStore {
        #if canImport(Security)
        return KeychainTokenStore(service: service)
        #else
        return InMemoryTokenStore()
        #endif
    }
}
