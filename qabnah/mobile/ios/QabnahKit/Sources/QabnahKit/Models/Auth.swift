import Foundation

/// Response of `POST /auth/otp/request`.
public struct OTPRequestResult: Codable, Hashable, Sendable {
    public var sent: Bool?
    public var expiresInSeconds: Int?
    /// Only present when the server runs with `OTP_DEV_ECHO=true` (never in production).
    public var devCode: String?
}

/// `Tokens` schema (also returned by `/auth/refresh`).
public struct TokensResponse: Codable, Hashable, Sendable {
    public var accessToken: String
    public var refreshToken: String
    /// Access token lifetime in seconds.
    public var expiresIn: Int?
}

/// `AuthResult` = `Tokens` + `{user, isNewUser}`.
public struct AuthResult: Codable, Hashable, Sendable {
    public var accessToken: String
    public var refreshToken: String
    public var expiresIn: Int?
    public var user: User?
    public var isNewUser: Bool?

    public var tokens: TokensResponse {
        TokensResponse(accessToken: accessToken, refreshToken: refreshToken, expiresIn: expiresIn)
    }
}

public struct User: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var phone: String?
    public var email: String?
    @DefaultEmptyString public var fullName: String
    /// `ar` | `en`
    public var locale: String?
    public var status: String?

    public var firstName: String {
        fullName.split(separator: " ").first.map(String.init) ?? fullName
    }
}

public struct RoleAssignment: Codable, Hashable, Sendable {
    public var key: String
    public var merchantId: String?
}

public struct MerchantMembership: Codable, Hashable, Identifiable, Sendable, BilingualNamed {
    public var id: String
    @DefaultEmptyString public var slug: String
    @DefaultEmptyString public var nameEn: String
    @DefaultEmptyString public var nameAr: String
    public var status: String?
    public var logoUrl: String?
    @DefaultEmpty public var permissions: [String]
}

/// `GET /me`.
public struct Me: Codable, Hashable, Sendable {
    public var user: User
    @DefaultEmpty public var roles: [RoleAssignment]
    @DefaultEmpty public var permissions: [String]
    @DefaultEmpty public var merchants: [MerchantMembership]
    /// `null` when the user has not registered as a captain.
    public var captain: CaptainProfile?
}
