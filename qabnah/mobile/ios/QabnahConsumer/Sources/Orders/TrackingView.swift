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
            if let loc = t.captain?.location { captainLocation = loc.latLng }
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
            out.append(MapPoint(id: "captain", kind: .captain, coordinate: CLLocationCoordinate2D(c), label: "captain"))
        }
        return out
    }
}

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
                PlacesMap(points: localizedPoints)
                infoCard
            }
        }
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

    private var infoCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let t = vm.tracking {
                HStack {
                    StatusPill(text: lang.t("order.status.\(t.orderStatus.rawValue)"), color: t.orderStatus.color)
                    if let ds = t.deliveryStatus {
                        StatusPill(text: lang.t("delivery.status.\(ds.rawValue)"), color: .secondary)
                    }
                    Spacer()
                    if vm.error != nil {
                        Image(systemName: "wifi.exclamationmark").foregroundColor(Brand.accent)
                            .accessibilityLabel(lang.t("tracking.reconnecting"))
                    }
                }
                if let mins = Formatters.minutesUntil(vm.etaDropoffAt), !vm.isDelivered {
                    Text(lang.f("tracking.eta_approx", mins)).font(.title3.bold())
                    Text(lang.t("tracking.eta_disclaimer")).font(.caption).foregroundColor(.secondary)
                }
                if let captain = t.captain {
                    captainRow(captain)
                } else if !vm.isDelivered {
                    Label(lang.t("tracking.finding_captain"), systemImage: "magnifyingglass")
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemBackground))
    }

    private func captainRow(_ c: CaptainPublic) -> some View {
        HStack(spacing: 12) {
            Image(systemName: c.vehicleType == .car || c.vehicleType == .van ? "car.fill" : "scooter")
                .font(.title2)
                .frame(width: 48, height: 48)
                .background(Brand.primaryLight, in: Circle())
                .foregroundColor(Brand.primary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(c.firstName).font(.headline)
                let vehicle = [c.vehicleColor, c.vehicleModel].compactMap { $0 }.joined(separator: " ")
                if !vehicle.isEmpty || c.vehicleType != nil {
                    Text(vehicle.isEmpty ? lang.t("vehicle.\(c.vehicleType?.rawValue ?? "bike")") : vehicle)
                        .font(.subheadline).foregroundColor(.secondary)
                }
                if let plate = c.vehiclePlate {
                    Text(verbatim: plate).font(.caption.monospaced()).padding(.horizontal, 6)
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.secondary))
                }
            }
            Spacer()
            if let r = c.ratingAvg, r > 0 {
                Label(Formatters.rating(r, language: lang.language), systemImage: "star.fill")
                    .font(.subheadline).foregroundColor(Brand.accent)
            }
            if let phone = c.phone, let url = ExternalLinks.tel(phone) {
                Link(destination: url) {
                    Image(systemName: "phone.fill")
                        .padding(12)
                        .background(Brand.primary, in: Circle())
                        .foregroundColor(.white)
                }
                .accessibilityLabel(lang.f("tracking.call_captain", c.firstName))
            }
        }
        .accessibilityElement(children: .contain)
    }
}
