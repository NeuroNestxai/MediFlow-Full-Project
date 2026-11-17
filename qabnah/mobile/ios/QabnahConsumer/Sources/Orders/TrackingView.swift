import SwiftUI
import MapKit
import QabnahKit

/// Live tracking: WebSocket `order:<id>` (`delivery.location`, `order.status_changed`,
/// `delivery.status_changed`) plus a 10 s `GET /orders/{id}/tracking` poll as fallback.
@MainActor
final class TrackingViewModel: ObservableObject {
    @Published private(set) var tracking: Tracking?
    @Published private(set) var error: Error?
    @Published private(set) var captainLocation: LatLng?
    @Published private(set) var captainHeading: Double?
    @Published private(set) var etaDropoffAt: Date?
    @Published private(set) var lastUpdate: Date?

    private let api: APIClient
    private let realtime: RealtimeClient
    let orderId: String
    private var tasks: [Task<Void, Never>] = []

    init(api: APIClient, realtime: RealtimeClient, orderId: String) {
        self.api = api
        self.realtime = realtime
        self.orderId = orderId
    }

    var isDelivered: Bool { tracking?.orderStatus.isDeliveredLike ?? false }

    func start() {
        guard tasks.isEmpty else { return }
        let channel = RealtimeChannel.order(orderId)
        tasks.append(Task { [weak self, realtime] in
            await realtime.subscribe(channel)
            for await event in realtime.events() where event.channel == channel {
                guard let self else { return }
                await self.handle(event)
            }
        })
        tasks.append(Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(nanoseconds: 10_000_000_000)
            }
        })
    }

    func stop() {
        tasks.forEach { $0.cancel() }
        tasks.removeAll()
        let channel = RealtimeChannel.order(orderId)
        Task { [realtime] in await realtime.unsubscribe(channel) }
    }

    func refresh() async {
        do {
            let t = try await api.send(Endpoints.tracking(orderId: orderId))
            tracking = t
            if let loc = t.captain?.location {
                captainLocation = loc.latLng
                captainHeading = loc.heading ?? captainHeading
            }
            etaDropoffAt = t.etaDropoffAt ?? etaDropoffAt
            lastUpdate = Date()
            error = nil
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            self.error = error
        }
    }

    private func handle(_ event: RealtimeEvent) async {
        switch event.name {
        case RealtimeEventName.deliveryLocation:
            if let loc = try? event.decodeData(DeliveryLocationEventData.self) {
                captainLocation = loc.latLng
                if let h = loc.heading { captainHeading = h }
                if let eta = loc.etaDropoffAt { etaDropoffAt = eta }
                lastUpdate = Date()
            }
        case RealtimeEventName.orderStatusChanged, RealtimeEventName.deliveryStatusChanged,
             RealtimeEventName.deliveryAssigned:
            await refresh()
        default:
            break
        }
    }

    var points: [MapPoint] {
        var out: [MapPoint] = []
        if let p = tracking?.pickup {
            out.append(MapPoint(id: "pickup", kind: .pickup, coordinate: CLLocationCoordinate2D(p), label: "pickup"))
        }
        if let d = tracking?.dropoff {
            out.append(MapPoint(id: "dropoff", kind: .dropoff, coordinate: CLLocationCoordinate2D(d), label: "dropoff"))
        }
        if let c = captainLocation, tracking?.deliveryStatus?.hasActiveCaptain ?? false {
            out.append(MapPoint(id: "captain", kind: .captain, coordinate: CLLocationCoordinate2D(c),
                                heading: captainHeading, label: "captain"))
        }
        return out
    }

    private var captainIsActive: Bool { tracking?.deliveryStatus?.hasActiveCaptain ?? false }

    /// Breadcrumbs from `GET /orders/{id}/tracking`, extended with the latest live position.
    var pathCoordinates: [CLLocationCoordinate2D] {
        var coords = (tracking?.path ?? []).map { CLLocationCoordinate2D($0) }
        if captainIsActive, let c = captainLocation, c != tracking?.path.last {
            coords.append(CLLocationCoordinate2D(c))
        }
        return coords
    }

    var captainCoordinate: CLLocationCoordinate2D? {
        guard captainIsActive, let c = captainLocation else { return nil }
        return CLLocationCoordinate2D(c)
    }

    /// Pickup until the parcel is collected, then the dropoff.
    var nextStop: CLLocationCoordinate2D? {
        guard let t = tracking, let status = t.deliveryStatus, status.hasActiveCaptain else { return nil }
        let stop = status.isBeforePickup ? t.pickup : t.dropoff
        return stop.map { CLLocationCoordinate2D($0) }
    }
}

/// Live tracking: the map fills the top; a sheet-like panel at the bottom carries the status,
/// the approximate ETA and the captain.
struct TrackingView: View {
    @EnvironmentObject var lang: LanguageSettings
    @StateObject private var vm: TrackingViewModel

    init(api: APIClient, realtime: RealtimeClient, orderId: String) {
        _vm = StateObject(wrappedValue: TrackingViewModel(api: api, realtime: realtime, orderId: orderId))
    }

    var body: some View {
        VStack(spacing: 0) {
            if vm.tracking == nil {
                if let error = vm.error {
                    ErrorStateView(error: error) { Task { await vm.refresh() } }
                } else {
                    LoadingView()
                }
            } else {
                RouteMapView(points: localizedPoints, path: vm.pathCoordinates,
                             dashedFrom: vm.captainCoordinate, dashedTo: vm.nextStop)
                panel
            }
        }
        .background(QTheme.background.ignoresSafeArea())
        .navigationTitle(lang.t("tracking.title"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { vm.start() }
        .onDisappear { vm.stop() }
    }

    private var localizedPoints: [MapPoint] {
        vm.points.map { p in
            var copy = p
            copy.label = lang.t("tracking.point.\(p.id)")
            return copy
        }
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            if let t = vm.tracking {
                statusRow(t)
                if let mins = Formatters.minutesUntil(vm.etaDropoffAt), !vm.isDelivered {
                    Text(lang.f("tracking.eta_approx", mins)).qFont(.h2).foregroundColor(QTheme.ink)
                    Text(lang.t("tracking.eta_disclaimer")).qFont(.small).foregroundColor(QTheme.muted)
                }
                if let captain = t.captain {
                    CaptainCard(captain: captain)
                } else if !vm.isDelivered {
                    HStack(spacing: QTheme.space2) {
                        Circle().fill(QTheme.saffron).frame(width: 8, height: 8).accessibilityHidden(true)
                        Text(lang.t("tracking.finding_captain")).qFont(.body).foregroundColor(QTheme.muted)
                    }
                }
            }
        }
        .padding(QTheme.space4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(QTheme.background)
        .clipShape(QTopRoundedShape(radius: QTheme.radiusLg))
        .qElevation2()
        .padding(.top, -QTheme.radiusLg)
    }

    private func statusRow(_ t: Tracking) -> some View {
        HStack(spacing: QTheme.space2) {
            StatusPill(text: lang.t("order.status.\(t.orderStatus.rawValue)"), color: t.orderStatus.color)
            if let ds = t.deliveryStatus {
                StatusPill(text: lang.t("delivery.status.\(ds.rawValue)"), color: QTheme.muted)
            }
            Spacer(minLength: 0)
            if vm.error != nil {
                Image(systemName: "wifi.exclamationmark")
                    .foregroundColor(QTheme.warning)
                    .accessibilityLabel(lang.t("tracking.reconnecting"))
            }
        }
    }
}
