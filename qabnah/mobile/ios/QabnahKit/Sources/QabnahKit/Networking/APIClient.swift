import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// MARK: - Transport

/// Minimal HTTP abstraction so the client can be unit-tested without a server.
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

/// `URLSession`-backed transport (works on Apple platforms and Linux FoundationNetworking).
public struct URLSessionTransport: HTTPTransport {
    public let session: URLSession

    public init(session: URLSession = URLSessionTransport.defaultSession) {
        self.session = session
    }

    public static let defaultSession: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 30
        c.timeoutIntervalForResource = 120
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: c)
    }()

    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        final class TaskBox: @unchecked Sendable { var task: URLSessionDataTask? }
        let box = TaskBox()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<(Data, HTTPURLResponse), Error>) in
                let task = session.dataTask(with: request) { data, response, error in
                    if let error {
                        cont.resume(throwing: error)
                    } else if let http = response as? HTTPURLResponse {
                        cont.resume(returning: (data ?? Data(), http))
                    } else {
                        cont.resume(throwing: URLError(.badServerResponse))
                    }
                }
                box.task = task
                task.resume()
            }
        } onCancel: {
            box.task?.cancel()
        }
    }
}

// MARK: - Single-flight refresh

/// Ensures only one `/auth/refresh` is in flight; concurrent 401s await the same result.
actor RefreshCoordinator {
    private var inFlight: Task<AuthTokens, Error>?

    func refresh(_ operation: @escaping @Sendable () async throws -> AuthTokens) async throws -> AuthTokens {
        if let existing = inFlight { return try await existing.value }
        let task = Task { try await operation() }
        inFlight = task
        defer { inFlight = nil }
        return try await task.value
    }
}

// MARK: - Client

/// async/await API client: Bearer auth, automatic refresh (single-flight) on 401 or imminent
/// expiry, error-envelope decoding into `APIError`, multipart uploads.
public final class APIClient: @unchecked Sendable {
    public let config: AppConfig
    public let tokenStore: TokenStore
    private let transport: HTTPTransport
    private let refresher = RefreshCoordinator()
    private let decoder = JSONDecoder.qabnah
    private let encoder = JSONEncoder.qabnah
    private let lock = NSLock()
    private var _language: AppLanguage = .default
    private var _onSessionExpired: (@Sendable () -> Void)?

    public init(config: AppConfig, tokenStore: TokenStore, transport: HTTPTransport = URLSessionTransport()) {
        self.config = config
        self.tokenStore = tokenStore
        self.transport = transport
    }

    /// Sent as `Accept-Language` so server error messages come back localized.
    public var language: AppLanguage {
        get { lock.lock(); defer { lock.unlock() }; return _language }
        set { lock.lock(); _language = newValue; lock.unlock() }
    }

    /// Called (on an arbitrary thread) when the refresh token is rejected; the app should
    /// return to the sign-in screen.
    public var onSessionExpired: (@Sendable () -> Void)? {
        get { lock.lock(); defer { lock.unlock() }; return _onSessionExpired }
        set { lock.lock(); _onSessionExpired = newValue; lock.unlock() }
    }

    public var isSignedIn: Bool { tokenStore.load() != nil }

    // MARK: Session

    /// Stores the tokens of a successful OTP verification.
    public func signIn(with result: AuthResult) {
        tokenStore.save(AuthTokens(result.tokens))
    }

    /// Best-effort server revoke, then local clear.
    public func signOut() async {
        if let t = tokenStore.load() {
            _ = try? await send(Endpoints.logout(refreshToken: t.refreshToken))
        }
        tokenStore.clear()
    }

    /// A non-expired access token (refreshing first if needed), e.g. for the WebSocket `?token=`.
    public func validAccessToken() async throws -> String {
        guard let tokens = tokenStore.load() else { throw APIError.unauthorized(message: nil) }
        if tokens.isExpiring() {
            return try await refreshTokens(failedAccessToken: tokens.accessToken).accessToken
        }
        return tokens.accessToken
    }

    // MARK: Requests

    @discardableResult
    public func send<R: Decodable>(_ endpoint: Endpoint<R>) async throws -> R {
        let data = try await perform(endpoint: endpoint) { token in
            try self.makeRequest(endpoint, accessToken: token)
        }
        return try decode(R.self, from: data)
    }

    /// `POST /files` multipart upload (`file` + `purpose`).
    public func uploadFile(data: Data, fileName: String, mimeType: String, purpose: FilePurpose) async throws -> FileRef {
        var form = MultipartFormData()
        form.addField(name: "purpose", value: purpose.rawValue)
        form.addFile(name: "file", fileName: fileName, mimeType: mimeType, data: data)
        let endpoint = Endpoint<FileRef>(.post, "/files")
        let body = form.encoded()
        let responseData = try await perform(endpoint: endpoint) { token in
            var req = try self.makeRequest(endpoint, accessToken: token)
            req.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
            req.httpBody = body
            req.timeoutInterval = 120
            return req
        }
        return try decode(FileRef.self, from: responseData)
    }

    /// Builds the `URLRequest` for an endpoint (exposed for tests).
    public func makeRequest<R>(_ endpoint: Endpoint<R>, accessToken: String?) throws -> URLRequest {
        var req = URLRequest(url: config.url(path: endpoint.path, query: endpoint.query))
        req.httpMethod = endpoint.method.rawValue
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(language.acceptLanguage, forHTTPHeaderField: "Accept-Language")
        if let body = endpoint.body {
            do {
                req.httpBody = try encoder.encode(body)
            } catch {
                throw APIError.invalidRequest("Could not encode body: \(error)")
            }
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        } else if endpoint.method == .post || endpoint.method == .put || endpoint.method == .patch {
            // Fastify rejects an empty body declared as JSON; send `{}` for body-less mutations.
            req.httpBody = Data("{}".utf8)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        for (k, v) in endpoint.headers { req.setValue(v, forHTTPHeaderField: k) }
        if endpoint.requiresAuth, let accessToken {
            req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        return req
    }

    // MARK: Internals

    private func perform<R>(endpoint: Endpoint<R>, build: (String?) throws -> URLRequest) async throws -> Data {
        var token: String?
        if endpoint.requiresAuth {
            guard let tokens = tokenStore.load() else { throw APIError.unauthorized(message: nil) }
            token = tokens.accessToken
            if tokens.isExpiring() {
                token = try await refreshTokens(failedAccessToken: tokens.accessToken).accessToken
            }
        }

        let (data, response) = try await execute(try build(token))
        if response.statusCode == 401 && endpoint.requiresAuth {
            let fresh = try await refreshTokens(failedAccessToken: token)
            let (retryData, retryResponse) = try await execute(try build(fresh.accessToken))
            if retryResponse.statusCode == 401 {
                expireSession()
                throw APIError.from(status: 401, data: retryData)
            }
            return try check(retryData, retryResponse)
        }
        return try check(data, response)
    }

    private func execute(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            try Task.checkCancellation()
            return try await transport.send(request)
        } catch {
            throw APIError.from(error)
        }
    }

    private func check(_ data: Data, _ response: HTTPURLResponse) throws -> Data {
        guard (200..<300).contains(response.statusCode) else {
            throw APIError.from(status: response.statusCode, data: data)
        }
        return data
    }

    private func decode<R: Decodable>(_ type: R.Type, from data: Data) throws -> R {
        if R.self == EmptyResponse.self { return EmptyResponse() as! R }
        do {
            return try decoder.decode(R.self, from: data)
        } catch let e as DecodingError {
            throw APIError.decoding(Self.describe(e))
        }
    }

    /// Refreshes once for all concurrent callers. If another caller already rotated the token
    /// (stored access token differs from the one that failed), reuse it instead.
    private func refreshTokens(failedAccessToken: String?) async throws -> AuthTokens {
        try await refresher.refresh { [self] in
            guard let current = self.tokenStore.load() else { throw APIError.unauthorized(message: nil) }
            if let failed = failedAccessToken, current.accessToken != failed, !current.isExpiring() {
                return current
            }
            let endpoint = Endpoints.refresh(refreshToken: current.refreshToken)
            let (data, response) = try await self.execute(try self.makeRequest(endpoint, accessToken: nil))
            if response.statusCode == 401 || response.statusCode == 403 {
                self.expireSession()
                throw APIError.unauthorized(message: (try? self.decoder.decode(ErrorEnvelope.self, from: data))?.error.message)
            }
            let tokens = AuthTokens(try self.decode(TokensResponse.self, from: try self.check(data, response)))
            self.tokenStore.save(tokens)
            return tokens
        }
    }

    private func expireSession() {
        tokenStore.clear()
        onSessionExpired?()
    }

    static func describe(_ e: DecodingError) -> String {
        func path(_ ctx: DecodingError.Context) -> String {
            ctx.codingPath.map { $0.intValue.map { "[\($0)]" } ?? $0.stringValue }.joined(separator: ".")
        }
        switch e {
        case .keyNotFound(let key, let ctx): return "missing key '\(key.stringValue)' at \(path(ctx))"
        case .typeMismatch(let t, let ctx): return "type mismatch (\(t)) at \(path(ctx)): \(ctx.debugDescription)"
        case .valueNotFound(let t, let ctx): return "null \(t) at \(path(ctx))"
        case .dataCorrupted(let ctx): return "corrupted at \(path(ctx)): \(ctx.debugDescription)"
        @unknown default: return "\(e)"
        }
    }
}

// MARK: - Multipart

public struct MultipartFormData {
    public let boundary: String
    private var parts: [Data] = []

    public init(boundary: String = "QabnahBoundary-\(UUID().uuidString)") {
        self.boundary = boundary
    }

    public var contentType: String { "multipart/form-data; boundary=\(boundary)" }

    public mutating func addField(name: String, value: String) {
        var d = Data()
        d.append("--\(boundary)\r\n")
        d.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
        d.append("\(value)\r\n")
        parts.append(d)
    }

    public mutating func addFile(name: String, fileName: String, mimeType: String, data: Data) {
        var d = Data()
        d.append("--\(boundary)\r\n")
        d.append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(fileName)\"\r\n")
        d.append("Content-Type: \(mimeType)\r\n\r\n")
        d.append(data)
        d.append("\r\n")
        parts.append(d)
    }

    public func encoded() -> Data {
        var out = Data()
        parts.forEach { out.append($0) }
        out.append("--\(boundary)--\r\n")
        return out
    }
}

private extension Data {
    mutating func append(_ string: String) { append(Data(string.utf8)) }
}
