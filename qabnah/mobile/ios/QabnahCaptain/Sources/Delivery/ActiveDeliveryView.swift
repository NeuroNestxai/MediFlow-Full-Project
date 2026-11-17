import SwiftUI
import MapKit
import QabnahKit

@MainActor
final class ActiveDeliveryViewModel: ObservableObject {
    @Published private(set) var delivery: CaptainDelivery
    @Published private(set) var runningAction: DeliveryAction?
    @Published var error: Error?

    private let api: APIClient
    private let currentLocation: () async -> LatLng?

    init(api: APIClient, delivery: CaptainDelivery, currentLocation: @escaping () async -> LatLng?) {
        self.api = api
        self.delivery = delivery
        self.currentLocation = currentLocation
    }

    func refresh() async {
        do {
            delivery = try await api.send(Endpoints.captainDelivery(id: delivery.id))
            error = nil
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            self.error = error
        }
    }

    func perform(_ action: DeliveryAction, reason: String? = nil) async -> CaptainDelivery? {
        runningAction = action
        defer { runningAction = nil }
        let loc = await currentLocation()
        do {
            delivery = try await api.send(Endpoints.advanceDelivery(
                id: delivery.id, DeliveryStatusInput(action: action, reason: reason, location: loc)))
            error = nil
            return delivery
        } catch {
            self.error = error
            if (error as? APIError)?.status == 409 { await refresh() } // invalid_transition: show the truth
            return nil
        }
    }

    func replace(_ d: CaptainDelivery) { delivery = d }
}

/// Active delivery: map, step progress, large call / WhatsApp / navigate buttons, the two stops,
/// and exactly one primary action in the bottom bar (release / fail live in the "more" menu).
struct ActiveDeliveryView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var store: CaptainStore
    @Environment(\.dismiss) var dismiss
    @Environment(\.openURL) var openURL
    @StateObject private var vm: ActiveDeliveryViewModel
    @State private var reasonAction: DeliveryAction? = nil
    @State private var showComplete = false
    @State private var showNavigation = false
    private let api: APIClient

    init(api: APIClient, store: CaptainStore, delivery: CaptainDelivery) {
        self.api = api
        let location = store.location
        _vm = StateObject(wrappedValue: ActiveDeliveryViewModel(api: api, delivery: delivery, currentLocation: { [weak location] in
            await location?.currentLocation(timeout: 5)?.latLng
        }))
    }

    private var d: CaptainDelivery { vm.delivery }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: QTheme.space4) {
                ActiveDeliveryMap(location: store.location, delivery: d, points: points)
                    .frame(height: 230)
                    .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous))
                header
                if let step = progressIndex {
                    QStepProgress(titles: progressTitles, current: step)
                }
                if d.codAmountBaisa > 0 { codBanner }
                quickActions
                placeCard(title: lang.t("job.pickup"), place: d.pickup, current: d.status.isBeforePickup, name: d.merchantName)
                placeCard(title: lang.t("job.dropoff"), place: d.dropoff, current: !d.status.isBeforePickup, name: nil)
                details
                InlineError(error: vm.error)
            }
            .padding(QTheme.space4)
        }
        .qScreen()
        .refreshable { await vm.refresh() }
        .safeAreaInset(edge: .bottom) { primaryBar }
        .navigationTitle(d.merchantName ?? lang.t("offer.parcel"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) { moreMenu }
        }
        .confirmationDialog(lang.t(d.status.isBeforePickup ? "job.navigate_pickup" : "job.navigate_dropoff"),
                            isPresented: $showNavigation, titleVisibility: .visible) {
            navigationChoices
        }
        .sheet(item: $reasonAction) { action in
            ReasonSheet(action: action) { reason in
                Task {
                    if let updated = await vm.perform(action, reason: reason) {
                        store.deliveryUpdated(updated)
                        if !updated.isActive { dismiss() }
                    }
                }
            }
        }
        .sheet(isPresented: $showComplete) {
            CompleteDeliveryView(api: api, delivery: d) { completed in
                vm.replace(completed)
                store.deliveryUpdated(completed)
                dismiss()
            }
        }
        .task { await vm.refresh() }
    }

    // MARK: Header and progress

    private var header: some View {
        HStack {
            StatusPill(text: lang.t("delivery.status.\(d.status.rawValue)"), color: QTheme.saffron)
            Spacer()
            if let n = d.orderNumber {
                Text(verbatim: n).qFont(.small, tabular: true).foregroundColor(QTheme.muted)
            }
        }
    }

    private var progressTitles: [String] {
        [lang.t("delivery.status.assigned"), lang.t("delivery.status.at_pickup"), lang.t("delivery.status.picked_up"),
         lang.t("delivery.status.at_dropoff"), lang.t("delivery.status.delivered")]
    }

    /// Position in the normal flow; nil for exceptional states (failed, returning…).
    private var progressIndex: Int? {
        switch d.status {
        case .assigned: return 0
        case .atPickup: return 1
        case .pickedUp: return 2
        case .atDropoff: return 3
        case .delivered: return 5
        default: return nil
        }
    }

    private var codBanner: some View {
        Label(lang.f("job.collect_cod", lang.money(d.codAmountBaisa)), systemImage: "banknote")
            .qFont(.h3)
            .foregroundColor(QTheme.warning)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(QTheme.space4)
            .background(QTheme.warning.opacity(0.14))
            .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous))
    }

    private var points: [MapPoint] {
        var out: [MapPoint] = []
        if let p = d.pickup?.location {
            out.append(MapPoint(id: "pickup", kind: .pickup, coordinate: CLLocationCoordinate2D(p), label: lang.t("job.pickup")))
        }
        if let p = d.dropoff?.location {
            out.append(MapPoint(id: "dropoff", kind: .dropoff, coordinate: CLLocationCoordinate2D(p), label: lang.t("job.dropoff")))
        }
        return out
    }

    // MARK: Call / WhatsApp / navigate

    /// Phone of the stop the captain is heading to, unless the server masked it.
    private var targetPhone: String? {
        guard let phone = d.currentTarget?.contactPhone, !phone.contains("*") else { return nil }
        return phone
    }

    private var targetName: String {
        d.currentTarget?.contactName ?? lang.t(d.status.isBeforePickup ? "job.pickup" : "job.dropoff")
    }

    private var quickActions: some View {
        HStack(alignment: .top, spacing: QTheme.space2) {
            if d.currentTarget?.location != nil {
                Button { showNavigation = true } label: {
                    QIconAction(systemImage: "location.north.fill", title: lang.t("job.navigate"))
                }
                .buttonStyle(.plain)
            }
            if let phone = targetPhone, let tel = ExternalLinks.tel(phone) {
                Link(destination: tel) {
                    QIconAction(systemImage: "phone.fill", title: lang.t("job.call"))
                }
                .accessibilityLabel(lang.f("job.call_a11y", targetName))
            }
            if let phone = targetPhone, let wa = ExternalLinks.whatsApp(phone) {
                Link(destination: wa) {
                    QIconAction(systemImage: "message.fill", title: lang.t("job.whatsapp"))
                }
                .accessibilityLabel(lang.f("job.whatsapp_a11y", targetName))
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private var navigationChoices: some View {
        if let dest = d.currentTarget?.location {
            Button(lang.f("job.navigate_with", "Apple Maps")) { navigate(.appleMaps, to: dest) }
            Button(lang.f("job.navigate_with", "Google Maps")) { navigate(.googleMaps, to: dest) }
            Button(lang.f("job.navigate_with", "Waze")) { navigate(.waze, to: dest) }
        }
        Button(lang.t("common.cancel"), role: .cancel) {}
    }

    private func navigate(_ app: ExternalLinks.NavigationApp, to dest: LatLng) {
        if let url = ExternalLinks.navigation(app, to: dest), UIApplication.shared.canOpenURL(url) {
            openURL(url)
        } else if let web = ExternalLinks.navigationWebFallback(app, to: dest) {
            openURL(web)
        }
    }

    // MARK: Stops and details

    private func placeCard(title: String, place: Place?, current: Bool, name: String?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: QTheme.space2) {
                Circle().fill(current ? QTheme.saffron : QTheme.muted).frame(width: 10, height: 10).accessibilityHidden(true)
                Text(title).qFont(.small, .semibold).foregroundColor(current ? QTheme.ink : QTheme.muted)
            }
            if let name { Text(name).qFont(.h3).foregroundColor(QTheme.ink) }
            if let contact = place?.contactName, contact != name {
                Text(contact).qFont(.h3).foregroundColor(QTheme.ink)
            }
            if let address = place?.address { Text(address).qFont(.body).foregroundColor(QTheme.ink) }
            if let notes = place?.notes, !notes.isEmpty {
                Text(notes).qFont(.small).foregroundColor(QTheme.muted)
            }
            if let phone = place?.contactPhone {
                Text(verbatim: phone)
                    .qFont(.small, tabular: true)
                    .foregroundColor(QTheme.muted)
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
        .overlay(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous)
            .stroke(current ? QTheme.saffron : Color.clear, lineWidth: 1.5))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var details: some View {
        if let desc = d.packageDescription {
            Label(desc, systemImage: "shippingbox").qFont(.body).foregroundColor(QTheme.ink)
        }
        if let items = d.itemsCount, items > 0 {
            Label(lang.f("job.items_count", items), systemImage: "list.bullet").qFont(.small).foregroundColor(QTheme.muted)
        }
    }

    // MARK: The one primary action

    private var primaryStep: DeliveryAction? { d.stepActions.first }

    @ViewBuilder private var primaryBar: some View {
        if let action = primaryStep {
            QNightBar {
                Button {
                    Task { if let u = await vm.perform(action) { store.deliveryUpdated(u) } }
                } label: {
                    if vm.runningAction == action {
                        ProgressView().tint(QTheme.inkOnLight)
                    } else {
                        Text(lang.t("action.\(action.rawValue)"))
                    }
                }
                .buttonStyle(SaffronButtonStyle())
                .disabled(vm.runningAction != nil)
                .accessibilityIdentifier("delivery.primary")
            }
        } else if d.nextActions.contains(.complete) {
            QNightBar {
                Button(lang.t("action.complete")) { showComplete = true }
                    .buttonStyle(SaffronButtonStyle())
                    .disabled(vm.runningAction != nil)
            }
        }
    }

    @ViewBuilder private var moreMenu: some View {
        if d.nextActions.contains(.release) || d.nextActions.contains(.fail) {
            Menu {
                if d.nextActions.contains(.release) {
                    Button(lang.t("action.release")) { reasonAction = .release }
                }
                if d.nextActions.contains(.fail) {
                    Button(lang.t("action.fail"), role: .destructive) { reasonAction = .fail }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .disabled(vm.runningAction != nil)
            .accessibilityLabel(lang.t("job.more_actions"))
        }
    }
}

/// Route map for the captain: pickup / dropoff markers, own position (system dot), the trail
/// driven while this screen is open and a dashed line to the next stop.
struct ActiveDeliveryMap: View {
    @ObservedObject var location: CaptainLocationService
    let delivery: CaptainDelivery
    let points: [MapPoint]
    @State private var trail: [CLLocationCoordinate2D] = []

    private var nextStop: CLLocationCoordinate2D? {
        guard delivery.isActive, let target = delivery.currentTarget?.location else { return nil }
        return CLLocationCoordinate2D(target)
    }

    var body: some View {
        RouteMapView(points: points, path: trail, dashedFrom: location.lastLocation?.coordinate,
                     dashedTo: nextStop, showsUserLocation: true)
            .onChange(of: location.lastLocation) { loc in
                if let loc { record(loc) }
            }
            .onAppear {
                if let loc = location.lastLocation { record(loc) }
            }
    }

    private func record(_ loc: CLLocation) {
        if let last = trail.last {
            let previous = CLLocation(latitude: last.latitude, longitude: last.longitude)
            guard previous.distance(from: loc) >= 10 else { return }
        }
        trail.append(loc.coordinate)
        if trail.count > 300 { trail.removeFirst(trail.count - 300) }
    }
}

/// `qabnah://delivery/<id>` / push tap: loads the delivery, then shows the active-delivery screen.
struct DeliveryByIdView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var store: CaptainStore
    let deliveryId: String
    @State private var state: Loadable<CaptainDelivery> = .idle

    var body: some View {
        LoadableView(state: state, retry: { Task { await load() } }) { delivery in
            ActiveDeliveryView(api: session.api, store: store, delivery: delivery)
        }
        .task {
            if state.value == nil { await load() }
        }
    }

    private func load() async {
        if let known = store.activeDeliveries.first(where: { $0.id == deliveryId }) {
            state = .loaded(known)
            return
        }
        state = .loading
        do {
            state = .loaded(try await session.api.send(Endpoints.captainDelivery(id: deliveryId)))
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            state = .failed(error)
        }
    }
}

extension DeliveryAction: Identifiable {
    public var id: String { rawValue }
}

/// Reason picker for `fail` / `release` (reason is required by the contract).
struct ReasonSheet: View {
    @EnvironmentObject var lang: LanguageSettings
    @Environment(\.dismiss) var dismiss
    let action: DeliveryAction
    let onSubmit: (String) -> Void
    @State private var preset: String? = nil
    @State private var custom = ""

    private var presets: [String] {
        action == .release
            ? ["vehicle_problem", "emergency", "too_far", "other"]
            : ["recipient_unreachable", "wrong_address", "recipient_refused", "item_damaged", "other"]
    }

    private var reason: String {
        let text = custom.trimmingCharacters(in: .whitespacesAndNewlines)
        if preset == "other" || preset == nil { return text }
        return text.isEmpty ? preset! : "\(preset!): \(text)"
    }

    var body: some View {
        NavigationStack {
            QForm {
                Section(lang.t(action == .release ? "reason.release_hint" : "reason.fail_hint")) {
                    ForEach(presets, id: \.self) { p in
                        Button {
                            preset = p
                        } label: {
                            HStack {
                                Text(lang.t("reason.\(p)"))
                                Spacer()
                                if preset == p { Image(systemName: "checkmark").foregroundColor(QTheme.tint) }
                            }
                        }
                        .foregroundColor(QTheme.ink)
                    }
                }
                Section(lang.t("reason.details")) {
                    TextField(lang.t("reason.details_placeholder"), text: $custom, axis: .vertical).lineLimit(2...5)
                }
            }
            .qScreen()
            .navigationTitle(lang.t("action.\(action.rawValue)"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(lang.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(lang.t("common.confirm")) {
                        onSubmit(reason)
                        dismiss()
                    }
                    .disabled(reason.isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .qSheet()
    }
}
