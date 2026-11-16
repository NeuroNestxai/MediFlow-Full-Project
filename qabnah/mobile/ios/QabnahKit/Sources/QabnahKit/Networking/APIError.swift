import Foundation

/// Error envelope `{ "error": { "code", "message", "details" } }`.
public struct ErrorEnvelope: Codable, Hashable, Sendable {
    public struct Body: Codable, Hashable, Sendable {
        public var code: String
        public var message: String
        public var details: JSONValue?
    }
    public var error: Body
}

/// Typed API error surfaced to view models.
public enum APIError: Error, Equatable, Sendable {
    /// Non-2xx with a contract error envelope.
    case server(status: Int, code: String, message: String, details: JSONValue?)
    /// Non-2xx without a parseable envelope.
    case http(status: Int, body: String?)
    /// Not signed in, or the session could not be refreshed (user must sign in again).
    case unauthorized(message: String?)
    /// Connectivity problem (offline, timeout, DNS, TLS…).
    case network(code: Int, message: String)
    /// Response body did not match the contract.
    case decoding(String)
    case cancelled
    case invalidRequest(String)

    public var status: Int? {
        switch self {
        case .server(let s, _, _, _), .http(let s, _): return s
        case .unauthorized: return 401
        default: return nil
        }
    }

    /// Contract error code (`validation_error`, `conflict`, `out_of_service_area`, …).
    public var code: String? {
        switch self {
        case .server(_, let code, _, _): return code
        case .unauthorized: return "unauthorized"
        default: return nil
        }
    }

    public var serverMessage: String? {
        if case .server(_, _, let m, _) = self { return m }
        return nil
    }

    public var details: JSONValue? {
        if case .server(_, _, _, let d) = self { return d }
        return nil
    }

    public var isConflict: Bool { status == 409 }
    public var isUnprocessable: Bool { status == 422 }
    public var isNotFound: Bool { status == 404 }
    public var isRateLimited: Bool { status == 429 || code == "rate_limited" }
    public var isNetwork: Bool { if case .network = self { return true }; return false }
    public var isCancelled: Bool { if case .cancelled = self { return true }; return false }

    /// Builds an error from a non-2xx response.
    public static func from(status: Int, data: Data) -> APIError {
        if let env = try? JSONDecoder.qabnah.decode(ErrorEnvelope.self, from: data) {
            return .server(status: status, code: env.error.code, message: env.error.message, details: env.error.details)
        }
        let text = String(data: data.prefix(500), encoding: .utf8)
        return .http(status: status, body: text)
    }

    static func from(_ error: Error) -> APIError {
        if let e = error as? APIError { return e }
        if error is CancellationError { return .cancelled }
        if let u = error as? URLError {
            if u.code == .cancelled { return .cancelled }
            return .network(code: u.code.rawValue, message: u.localizedDescription)
        }
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain {
            if ns.code == NSURLErrorCancelled { return .cancelled }
            return .network(code: ns.code, message: ns.localizedDescription)
        }
        return .network(code: ns.code, message: ns.localizedDescription)
    }
}

extension APIError: LocalizedError {
    /// A developer-oriented fallback message. Apps should map `code` to localized copy and
    /// fall back to `serverMessage` (the server localizes using `Accept-Language`).
    public var errorDescription: String? {
        switch self {
        case .server(_, _, let message, _): return message
        case .http(let status, _): return "HTTP \(status)"
        case .unauthorized(let m): return m ?? "Please sign in again."
        case .network(_, let m): return m
        case .decoding(let m): return "Unexpected response: \(m)"
        case .cancelled: return "Cancelled"
        case .invalidRequest(let m): return m
        }
    }
}
