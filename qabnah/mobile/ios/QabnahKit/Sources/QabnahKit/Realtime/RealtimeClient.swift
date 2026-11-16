import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// WebSocket client for `GET /v1/realtime?token=<accessToken>`.
///
/// - Keeps a set of desired channels and re-subscribes after every reconnect.
/// - Reconnects with exponential backoff + jitter (1 s … 30 s).
/// - Sends `{"type":"ping"}` every 25 s; if no `pong` arrives for 60 s the socket is recycled.
/// - Fan-out: every `events()` call returns an independent `AsyncStream`.
public actor RealtimeClient {
    public enum State: Equatable, Sendable {
        case idle
        case connecting
        case connected
        case waitingToReconnect(seconds: Double)
    }

    private let url: URL
    private let tokenProvider: @Sendable () async throws -> String
    private let session: URLSession
    private let pingInterval: TimeInterval
    private let pongTimeout: TimeInterval

    private var task: URLSessionWebSocketTask?
    private var generation = 0
    private var wantsConnection = false
    private var channels: Set<String> = []
    private var channelRefs: [String: Int] = [:]
    private var backoff = Backoff(base: 1, max: 30)
    private var lastPong = Date()
    private var receiveLoop: Task<Void, Never>?
    private var pingLoop: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?

    private var eventSubscribers: [UUID: AsyncStream<RealtimeEvent>.Continuation] = [:]
    private var stateSubscribers: [UUID: AsyncStream<State>.Continuation] = [:]
    public private(set) var state: State = .idle {
        didSet {
            guard state != oldValue else { return }
            stateSubscribers.values.forEach { $0.yield(state) }
        }
    }

    /// - Parameters:
    ///   - url: `AppConfig.realtimeURL`.
    ///   - tokenProvider: returns a valid access token (e.g. `APIClient.validAccessToken`).
    public init(url: URL,
                session: URLSession = URLSession(configuration: .default),
                pingInterval: TimeInterval = 25,
                pongTimeout: TimeInterval = 60,
                tokenProvider: @escaping @Sendable () async throws -> String) {
        self.url = url
        self.session = session
        self.pingInterval = pingInterval
        self.pongTimeout = pongTimeout
        self.tokenProvider = tokenProvider
    }

    // MARK: Public API

    /// Start (or keep) a connection. Safe to call repeatedly.
    public func start() {
        wantsConnection = true
        if task == nil && reconnectTask == nil { connect() }
    }

    /// Close the socket and stop reconnecting. Channels are kept for the next `start()`.
    public func stop() {
        wantsConnection = false
        reconnectTask?.cancel()
        reconnectTask = nil
        tearDown()
        state = .idle
    }

    /// Stop and forget all channels (sign-out).
    public func reset() {
        channels.removeAll()
        channelRefs.removeAll()
        stop()
    }

    /// Reference-counted: several screens may watch the same channel (order detail + tracking);
    /// the server-side subscription is dropped only when the last one unsubscribes.
    public func subscribe(_ channel: String) {
        channelRefs[channel, default: 0] += 1
        let inserted = channels.insert(channel).inserted
        if inserted, state == .connected { transmit(.subscribe(channel)) }
    }

    public func unsubscribe(_ channel: String) {
        guard let refs = channelRefs[channel] else { return }
        if refs > 1 {
            channelRefs[channel] = refs - 1
            return
        }
        channelRefs[channel] = nil
        guard channels.remove(channel) != nil else { return }
        if state == .connected { transmit(.unsubscribe(channel)) }
    }

    /// Channels currently wanted (re-subscribed after every reconnect).
    public var activeChannels: Set<String> { channels }

    public var isConnected: Bool { state == .connected }

    /// Sends a captain location over the socket. Returns false when not connected so the
    /// caller can fall back to `POST /captain/location`.
    public func sendLocation(_ ping: LocationPing) async -> Bool {
        guard state == .connected, let task else { return false }
        do {
            try await task.send(.string(String(decoding: try RealtimeOutbound.location(ping).encoded(), as: UTF8.self)))
            return true
        } catch {
            handleFailure(generation: generation)
            return false
        }
    }

    /// Independent stream of every inbound event. Filter by `channel`/`name`.
    public nonisolated func events() -> AsyncStream<RealtimeEvent> {
        AsyncStream { continuation in
            let id = UUID()
            Task { await self.addEventSubscriber(id, continuation) }
            continuation.onTermination = { _ in Task { await self.removeEventSubscriber(id) } }
        }
    }

    /// Stream of connection state changes (starts with the current state).
    public nonisolated func states() -> AsyncStream<State> {
        AsyncStream { continuation in
            let id = UUID()
            Task { await self.addStateSubscriber(id, continuation) }
            continuation.onTermination = { _ in Task { await self.removeStateSubscriber(id) } }
        }
    }

    // MARK: Subscribers

    private func addEventSubscriber(_ id: UUID, _ c: AsyncStream<RealtimeEvent>.Continuation) {
        eventSubscribers[id] = c
    }

    private func removeEventSubscriber(_ id: UUID) { eventSubscribers[id] = nil }

    private func addStateSubscriber(_ id: UUID, _ c: AsyncStream<State>.Continuation) {
        stateSubscribers[id] = c
        c.yield(state)
    }

    private func removeStateSubscriber(_ id: UUID) { stateSubscribers[id] = nil }

    // MARK: Connection lifecycle

    private func connect() {
        guard wantsConnection else { return }
        generation += 1
        let gen = generation
        state = .connecting
        reconnectTask = Task { [weak self] in
            guard let self else { return }
            do {
                let token = try await self.tokenProvider()
                await self.open(token: token, generation: gen)
            } catch {
                await self.handleFailure(generation: gen)
            }
        }
    }

    private func open(token: String, generation gen: Int) async {
        reconnectTask = nil
        guard wantsConnection, gen == generation else { return }
        var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "token", value: token)]
        guard let wsURL = comps.url else { return }

        let t = session.webSocketTask(with: wsURL)
        task = t
        t.resume()

        // The first successful send completes after the HTTP upgrade, so it doubles as
        // our "connected" signal.
        do {
            try await t.send(.string(String(decoding: try RealtimeOutbound.ping.encoded(), as: UTF8.self)))
        } catch {
            handleFailure(generation: gen)
            return
        }
        guard gen == generation else { return }
        state = .connected
        backoff.reset()
        lastPong = Date()
        for ch in channels { transmit(.subscribe(ch)) }
        startReceiving(t, generation: gen)
        startPinging(generation: gen)
    }

    private func startReceiving(_ t: URLSessionWebSocketTask, generation gen: Int) {
        receiveLoop = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    let message = try await t.receive()
                    await self?.handle(message)
                } catch {
                    await self?.handleFailure(generation: gen)
                    return
                }
            }
        }
    }

    private func startPinging(generation gen: Int) {
        let interval = pingInterval
        pingLoop = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
                guard !Task.isCancelled, let self else { return }
                await self.pingTick(generation: gen)
            }
        }
    }

    private func pingTick(generation gen: Int) {
        guard gen == generation, state == .connected else { return }
        if Date().timeIntervalSince(lastPong) > pongTimeout {
            handleFailure(generation: gen)
            return
        }
        transmit(.ping)
    }

    private func handle(_ message: URLSessionWebSocketTask.Message) {
        let data: Data
        switch message {
        case .string(let s): data = Data(s.utf8)
        case .data(let d): data = d
        @unknown default: return
        }
        guard let inbound = try? RealtimeInbound.decode(data) else { return }
        lastPong = Date() // any traffic proves liveness
        switch inbound {
        case .event(let e):
            eventSubscribers.values.forEach { $0.yield(e) }
        case .error(let code, let channel, _):
            // Forbidden channels won't succeed on retry; drop them.
            if code == "forbidden", let channel {
                channels.remove(channel)
                channelRefs[channel] = nil
            }
        case .pong, .subscribed, .unknown:
            break
        }
    }

    private func transmit(_ message: RealtimeOutbound) {
        guard let t = task, let data = try? message.encoded() else { return }
        let gen = generation
        let text = String(decoding: data, as: UTF8.self)
        Task { [weak self] in
            do { try await t.send(.string(text)) } catch { await self?.handleFailure(generation: gen) }
        }
    }

    private func handleFailure(generation gen: Int) {
        guard gen == generation else { return } // stale callback from an old socket
        tearDown()
        guard wantsConnection else { state = .idle; return }
        let delay = backoff.next()
        state = .waitingToReconnect(seconds: delay)
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self?.reconnectNow()
        }
    }

    private func reconnectNow() {
        reconnectTask = nil
        connect()
    }

    private func tearDown() {
        generation += 1
        receiveLoop?.cancel(); receiveLoop = nil
        pingLoop?.cancel(); pingLoop = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }
}
