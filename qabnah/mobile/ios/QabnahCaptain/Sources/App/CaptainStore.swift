import SwiftUI
import CoreLocation
import QabnahKit

/// Long-lived captain state shared by all tabs: profile, online status, offers, active jobs,
/// and location streaming (WebSocket `location` every ≥5 s, REST fallback).
@MainActor
final class CaptainStore: ObservableObject {
    @Published private(set) var profile: CaptainProfile?
    @Published private(set) var profileState: Loadable<CaptainProfile> = .idle
    @Published private(set) var isOnline = false
    @Published private(set) var isTogglingOnline = false
    @Published var onlineError: Error?
    @Published var needsLocationPermission = false

    @Published private(set) var offers: [Offer] = []
    @Published var presentedOffer: Offer?
    @Published private(set) var respondingOfferId: String?
    @Published var offerError: Error?

    @Published private(set) var activeDeliveries: [CaptainDelivery] = []
    @Published var activeError: Error?

    let api: APIClient
    let realtime: RealtimeClient
    let location = CaptainLocationService()

    static let minLocationInterval: TimeInterval = 5
    private var lastLocationSent: Date = .distantPast
    private var dismissedOfferIds: Set<String> = []
    private var eventsTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?

    init(api: APIClient, realtime: RealtimeClient) {
        self.api = api
        self.realtime = realtime
        location.onLocation = { [weak self] loc in self?.locationUpdated(loc) }
    }

    // MARK: Profile

    func setProfile(_ p: CaptainProfile) {
        profile = p
        profileState = .loaded(p)
        if isOnline != p.isOnline {
            isOnline = p.isOnline
            isOnline ? startOnlineLoops() : stopOnlineLoops()
        }
    }

    func refreshProfile() async {
        if profile == nil { profileState = .loading }
        do {
            setProfile(try await api.send(Endpoints.captainProfile()))
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            if profile == nil { profileState = .failed(error) }
        }
    }

    // MARK: Online / offline

    func setOnline(_ online: Bool) async {
        guard profile?.canGoOnline == true || !online else { return }
        isTogglingOnline = true
        defer { isTogglingOnline = false }
        var coords: LatLng?
        if online {
            location.requestPermission()
            guard let loc = await location.currentLocation() else {
                needsLocationPermission = location.isDenied
                if location.isDenied {
                    onlineError = nil
                } else {
                    onlineError = LocalizedKeyError(key: "error.location_unavailable")
                }
                return
            }
            coords = loc.latLng
        } else {
            coords = location.lastLocation?.latLng
        }
        do {
            let p = try await api.send(Endpoints.setCaptainStatus(online: online, location: coords))
            onlineError = nil
            setProfile(p)
            // Some servers may not echo isOnline; trust the request outcome.
            if isOnline != online {
                isOnline = online
                online ? startOnlineLoops() : stopOnlineLoops()
            }
        } catch {
            onlineError = error
        }
    }

    private func startOnlineLoops() {
        location.startTracking()
        Task { await realtime.start(); await realtime.subscribe(RealtimeChannel.captainMe) }
        if eventsTask == nil {
            eventsTask = Task { [weak self, realtime] in
                for await event in realtime.events() where event.channel == RealtimeChannel.captainMe {
                    await self?.handle(event)
                }
            }
        }
        if pollTask == nil {
            pollTask = Task { [weak self] in
                while !Task.isCancelled {
                    await self?.refreshOffers()
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                }
            }
        }
    }

    private func stopOnlineLoops() {
        location.stopTracking()
        eventsTask?.cancel(); eventsTask = nil
        pollTask?.cancel(); pollTask = nil
        Task { await realtime.unsubscribe(RealtimeChannel.captainMe) }
        offers = []
        presentedOffer = nil
    }

    /// Sign-out / session expiry.
    func reset() {
        stopOnlineLoops()
        isOnline = false
        profile = nil
        profileState = .idle
        activeDeliveries = []
        dismissedOfferIds = []
    }

    private func locationUpdated(_ loc: CLLocation) {
        guard isOnline, Date().timeIntervalSince(lastLocationSent) >= Self.minLocationInterval else { return }
        lastLocationSent = Date()
        let ping = loc.ping
        Task { [api, realtime] in
            if await realtime.sendLocation(ping) { return }
            _ = try? await api.send(Endpoints.reportLocation(ping))
        }
    }

    // MARK: Offers

    private func handle(_ event: RealtimeEvent) async {
        switch event.name {
        case RealtimeEventName.offerCreated:
            if let offer = try? event.decodeData(Offer.self) {
                if !offers.contains(where: { $0.id == offer.id }) { offers.append(offer) }
                presentNextOffer()
            } else {
                await refreshOffers()
            }
        case RealtimeEventName.offerExpired, RealtimeEventName.offerCancelled:
            await refreshOffers()
        case RealtimeEventName.deliveryAssigned, RealtimeEventName.deliveryStatusChanged:
            await refreshActive()
        default:
            break
        }
    }

    func refreshOffers() async {
        do {
            let items = try await api.send(Endpoints.captainOffers()).items
            offers = items.filter { !$0.isExpired() }
            if let shown = presentedOffer, !offers.contains(where: { $0.id == shown.id }) {
                presentedOffer = nil
            }
            presentNextOffer()
        } catch {
            // Polling: transient failures are retried in 5 s.
        }
    }

    private func presentNextOffer() {
        offers.removeAll { $0.isExpired() }
        guard presentedOffer == nil else { return }
        presentedOffer = offers.first { !dismissedOfferIds.contains($0.id) }
    }

    func dismissOffer(_ offer: Offer) {
        dismissedOfferIds.insert(offer.id)
        if presentedOffer?.id == offer.id { presentedOffer = nil }
    }

    func showOffer(_ offer: Offer) {
        dismissedOfferIds.remove(offer.id)
        presentedOffer = offer
    }

    /// Returns the assigned delivery, or nil (409 taken/expired → `offerError`).
    func accept(_ offer: Offer) async -> CaptainDelivery? {
        respondingOfferId = offer.id
        defer { respondingOfferId = nil }
        do {
            let delivery = try await api.send(Endpoints.acceptOffer(id: offer.id))
            offers.removeAll { $0.id == offer.id }
            presentedOffer = nil
            offerError = nil
            activeDeliveries.removeAll { $0.id == delivery.id }
            activeDeliveries.insert(delivery, at: 0)
            return delivery
        } catch {
            offerError = error
            if (error as? APIError)?.isConflict == true {
                offers.removeAll { $0.id == offer.id }
                dismissedOfferIds.insert(offer.id)
            }
            return nil
        }
    }

    func reject(_ offer: Offer, reason: String?) async {
        respondingOfferId = offer.id
        defer { respondingOfferId = nil }
        do {
            _ = try await api.send(Endpoints.rejectOffer(id: offer.id, reason: reason))
        } catch {
            // Rejecting an offer that already expired is fine.
        }
        offers.removeAll { $0.id == offer.id }
        dismissOffer(offer)
        presentNextOffer()
    }

    // MARK: Active deliveries

    func refreshActive() async {
        do {
            activeDeliveries = try await api.send(Endpoints.captainDeliveries(status: .active)).items
            activeError = nil
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            activeError = error
        }
    }

    func deliveryUpdated(_ d: CaptainDelivery) {
        if d.isActive {
            if let i = activeDeliveries.firstIndex(where: { $0.id == d.id }) { activeDeliveries[i] = d }
            else { activeDeliveries.insert(d, at: 0) }
        } else {
            activeDeliveries.removeAll { $0.id == d.id }
        }
    }
}
