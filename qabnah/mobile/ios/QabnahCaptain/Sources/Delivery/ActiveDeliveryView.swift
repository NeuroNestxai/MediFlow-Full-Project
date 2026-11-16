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

struct ActiveDeliveryView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var store: CaptainStore
    @Environment(\.dismiss) var dismiss
    @Environment(\.openURL) var openURL
    @StateObject private var vm: ActiveDeliveryViewModel
    @State private var reasonAction: DeliveryAction? = nil
    @State private var showComplete = false
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
            VStack(alignment: .leading, spacing: 14) {
                PlacesMap(points: points, showsUserLocation: true)
                    .frame(height: 240)
                    .clipShape(RoundedRectangle(cornerRadius: Brand.radiusMd))

                HStack {
                    StatusPill(text: lang.t("delivery.status.\(d.status.rawValue)"))
                    Spacer()
                    if let n = d.orderNumber { Text(verbatim: n).font(.caption.monospaced()).foregroundColor(.secondary) }
                }

                if d.codAmountBaisa > 0 {
                    Label(lang.f("job.collect_cod", lang.money(d.codAmountBaisa)), systemImage: "banknote")
                        .font(.headline)
                        .foregroundColor(Brand.accent)
                        .card()
                }

                if let target = d.currentTarget, let loc = target.location {
                    navigationButtons(to: loc)
                }

                placeCard(title: lang.t("job.pickup"), place: d.pickup, icon: "bag.fill",
                          highlight: d.status.isBeforePickup, name: d.merchantName)
                placeCard(title: lang.t("job.dropoff"), place: d.dropoff, icon: "house.fill",
                          highlight: !d.status.isBeforePickup, name: nil)

                if let desc = d.packageDescription {
                    Label(desc, systemImage: "shippingbox").card()
                }
                if let items = d.itemsCount, items > 0 {
                    Label(lang.f("job.items_count", items), systemImage: "list.bullet").font(.subheadline)
                }

                InlineError(error: vm.error)
                actionButtons
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .refreshable { await vm.refresh() }
        .navigationTitle(d.merchantName ?? lang.t("offer.parcel"))
        .navigationBarTitleDisplayMode(.inline)
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

    private func navigationButtons(to dest: LatLng) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(lang.t(d.status.isBeforePickup ? "job.navigate_pickup" : "job.navigate_dropoff")).font(.headline)
            HStack(spacing: 8) {
                navButton(.appleMaps, title: "Apple Maps", dest: dest)
                navButton(.googleMaps, title: "Google Maps", dest: dest)
                navButton(.waze, title: "Waze", dest: dest)
            }
        }
        .card()
    }

    private func navButton(_ app: ExternalLinks.NavigationApp, title: String, dest: LatLng) -> some View {
        Button {
            if let url = ExternalLinks.navigation(app, to: dest), UIApplication.shared.canOpenURL(url) {
                openURL(url)
            } else if let web = ExternalLinks.navigationWebFallback(app, to: dest) {
                openURL(web)
            }
        } label: {
            Text(verbatim: title).font(.caption.bold()).frame(maxWidth: .infinity, minHeight: 40)
        }
        .buttonStyle(.bordered)
        .accessibilityLabel(lang.f("job.navigate_with", title))
    }

    private func placeCard(title: String, place: Place?, icon: String, highlight: Bool, name: String?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: icon).font(.caption.bold()).foregroundColor(highlight ? Brand.primary : .secondary)
            if let name { Text(name).font(.headline) }
            if let contact = place?.contactName, contact != name { Text(contact).font(.headline) }
            if let address = place?.address { Text(address).font(.subheadline) }
            if let notes = place?.notes, !notes.isEmpty {
                Text(notes).font(.footnote).italic().foregroundColor(.secondary)
            }
            if let phone = place?.contactPhone, !phone.contains("*") {
                HStack(spacing: 10) {
                    if let tel = ExternalLinks.tel(phone) {
                        Link(destination: tel) { Label(lang.t("job.call"), systemImage: "phone.fill") }
                            .buttonStyle(.bordered)
                            .accessibilityLabel(lang.f("job.call_a11y", place?.contactName ?? title))
                    }
                    if let wa = ExternalLinks.whatsApp(phone) {
                        Link(destination: wa) { Label("WhatsApp", systemImage: "message.fill") }
                            .buttonStyle(.bordered)
                            .tint(Brand.success)
                            .accessibilityLabel(lang.f("job.whatsapp_a11y", place?.contactName ?? title))
                    }
                }
            } else if let masked = place?.contactPhone {
                Text(verbatim: masked).font(.caption.monospaced()).foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
        .overlay(RoundedRectangle(cornerRadius: Brand.radiusMd).stroke(highlight ? Brand.primary : .clear, lineWidth: 2))
    }

    private var actionButtons: some View {
        VStack(spacing: 10) {
            ForEach(d.stepActions, id: \.self) { action in
                Button {
                    Task { if let u = await vm.perform(action) { store.deliveryUpdated(u) } }
                } label: {
                    if vm.runningAction == action { ProgressView().tint(.white) } else { Text(lang.t("action.\(action.rawValue)")) }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(vm.runningAction != nil)
            }
            if d.nextActions.contains(.complete) {
                Button(lang.t("action.complete")) { showComplete = true }
                    .buttonStyle(PrimaryButtonStyle(color: Brand.success))
                    .disabled(vm.runningAction != nil)
            }
            HStack(spacing: 10) {
                if d.nextActions.contains(.release) {
                    Button(lang.t("action.release")) { reasonAction = .release }
                        .buttonStyle(SecondaryButtonStyle(color: Brand.accent))
                }
                if d.nextActions.contains(.fail) {
                    Button(lang.t("action.fail")) { reasonAction = .fail }
                        .buttonStyle(SecondaryButtonStyle(color: Brand.danger))
                }
            }
            .disabled(vm.runningAction != nil)
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
            Form {
                Section(lang.t(action == .release ? "reason.release_hint" : "reason.fail_hint")) {
                    ForEach(presets, id: \.self) { p in
                        Button {
                            preset = p
                        } label: {
                            HStack {
                                Text(lang.t("reason.\(p)"))
                                Spacer()
                                if preset == p { Image(systemName: "checkmark").foregroundColor(Brand.primary) }
                            }
                        }
                        .foregroundColor(.primary)
                    }
                }
                Section(lang.t("reason.details")) {
                    TextField(lang.t("reason.details_placeholder"), text: $custom, axis: .vertical).lineLimit(2...5)
                }
            }
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
    }
}
