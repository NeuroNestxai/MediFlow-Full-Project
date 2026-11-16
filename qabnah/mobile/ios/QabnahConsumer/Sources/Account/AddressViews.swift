import SwiftUI
import MapKit
import QabnahKit

@MainActor
final class AddressEditorViewModel: ObservableObject {
    @Published var location: LatLng?
    @Published var label = ""
    @Published var area = ""
    @Published var street = ""
    @Published var building = ""
    @Published var floor = ""
    @Published var apartment = ""
    @Published var landmark = ""
    @Published var contactName = ""
    @Published var contactPhone = ""
    @Published var isDefault = false
    @Published private(set) var isSaving = false
    @Published var error: Error?

    private let api: APIClient
    let existing: Address?

    init(api: APIClient, existing: Address?) {
        self.api = api
        self.existing = existing
        if let a = existing {
            location = a.location
            label = a.label ?? ""
            area = a.area ?? ""
            street = a.street ?? ""
            building = a.building ?? ""
            floor = a.floor ?? ""
            apartment = a.apartment ?? ""
            landmark = a.landmark ?? ""
            contactName = a.contactName ?? ""
            contactPhone = a.contactPhone ?? ""
            isDefault = a.isDefault ?? false
        }
    }

    var canSave: Bool { location != nil && !isSaving }

    private func clean(_ s: String) -> String? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    func save() async -> Address? {
        guard let location else { return nil }
        let phone = clean(contactPhone).map { PhoneNumber.normalizeOmaniMobile($0) ?? $0 }
        let input = AddressInput(label: clean(label), location: location, area: clean(area), street: clean(street),
                                 building: clean(building), floor: clean(floor), apartment: clean(apartment),
                                 landmark: clean(landmark), contactName: clean(contactName), contactPhone: phone,
                                 isDefault: isDefault)
        isSaving = true
        defer { isSaving = false }
        do {
            let saved: Address
            if let existing {
                saved = try await api.send(Endpoints.updateAddress(id: existing.id, input))
            } else {
                saved = try await api.send(Endpoints.createAddress(input))
            }
            error = nil
            return saved
        } catch {
            self.error = error
            return nil
        }
    }
}

/// Create (drop a pin) or edit a saved address.
struct AddressEditorView: View {
    @EnvironmentObject var lang: LanguageSettings
    @Environment(\.dismiss) var dismiss
    @StateObject private var vm: AddressEditorViewModel
    @State private var showPinPicker = false
    @State private var savedOutOfArea: Address? = nil
    let onSaved: (Address) -> Void

    init(api: APIClient, existing: Address?, onSaved: @escaping (Address) -> Void) {
        _vm = StateObject(wrappedValue: AddressEditorViewModel(api: api, existing: existing))
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(lang.t("address.location")) {
                    if let loc = vm.location {
                        PlacesMap(points: [MapPoint(id: "pin", kind: .dropoff, coordinate: CLLocationCoordinate2D(loc),
                                                    label: lang.t("address.location"))])
                            .frame(height: 160)
                            .allowsHitTesting(false)
                            .listRowInsets(EdgeInsets())
                    }
                    Button {
                        showPinPicker = true
                    } label: {
                        Label(lang.t(vm.location == nil ? "address.drop_pin" : "address.move_pin"), systemImage: "mappin")
                    }
                }
                Section(lang.t("address.details")) {
                    TextField(lang.t("address.label_placeholder"), text: $vm.label)
                    TextField(lang.t("address.area"), text: $vm.area)
                    TextField(lang.t("address.street"), text: $vm.street)
                    TextField(lang.t("address.building"), text: $vm.building)
                    HStack {
                        TextField(lang.t("address.floor"), text: $vm.floor)
                        TextField(lang.t("address.apartment"), text: $vm.apartment)
                    }
                    TextField(lang.t("address.landmark"), text: $vm.landmark)
                }
                Section(lang.t("address.contact")) {
                    TextField(lang.t("address.contact_name"), text: $vm.contactName).textContentType(.name)
                    TextField(lang.t("address.contact_phone"), text: $vm.contactPhone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                    Toggle(lang.t("address.default"), isOn: $vm.isDefault)
                }
                if vm.error != nil { Section { InlineError(error: vm.error) } }
            }
            .navigationTitle(lang.t(vm.existing == nil ? "address.new" : "address.edit"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(lang.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if vm.isSaving {
                        ProgressView()
                    } else {
                        Button(lang.t("common.save")) {
                            Task {
                                guard let saved = await vm.save() else { return }
                                onSaved(saved)
                                if saved.isInServiceArea { dismiss() } else { savedOutOfArea = saved }
                            }
                        }
                        .disabled(!vm.canSave)
                    }
                }
            }
            .fullScreenCover(isPresented: $showPinPicker) {
                PinPickerView(title: lang.t("address.drop_pin"), initial: vm.location) { vm.location = $0 }
                    .environmentObject(lang)
                    .qabnahLocalized(lang)
            }
            .alert(lang.t("address.out_of_area"), isPresented: Binding(get: { savedOutOfArea != nil },
                                                                       set: { if !$0 { savedOutOfArea = nil } })) {
                Button(lang.t("common.ok")) { dismiss() }
            } message: {
                Text(lang.t("address.out_of_area_message"))
            }
            .onAppear { if vm.location == nil { showPinPicker = true } }
        }
    }
}

@MainActor
final class AddressesViewModel: ObservableObject {
    @Published private(set) var state: Loadable<[Address]> = .idle
    @Published var actionError: Error?
    private let api: APIClient

    init(api: APIClient) { self.api = api }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            state = .loaded(try await api.send(Endpoints.addresses()).items)
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            state = .failed(error)
        }
    }

    func delete(_ address: Address) async {
        do {
            _ = try await api.send(Endpoints.deleteAddress(id: address.id))
            state = .loaded((state.value ?? []).filter { $0.id != address.id })
            actionError = nil
        } catch {
            actionError = error
        }
    }
}

struct AddressesView: View {
    @EnvironmentObject var lang: LanguageSettings
    @StateObject private var vm: AddressesViewModel
    @State private var editing: Address? = nil
    @State private var creating = false
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
        _vm = StateObject(wrappedValue: AddressesViewModel(api: api))
    }

    var body: some View {
        LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { list in
            if list.isEmpty {
                EmptyStateView(systemImage: "mappin.slash", title: lang.t("address.empty"), message: lang.t("address.empty_hint"))
            } else {
                List {
                    if vm.actionError != nil { InlineError(error: vm.actionError) }
                    ForEach(list) { a in
                        Button { editing = a } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(a.label ?? lang.t("address.unnamed")).font(.headline)
                                    if a.isDefault == true { StatusPill(text: lang.t("address.default_badge")) }
                                }
                                Text(a.summary).font(.caption).foregroundColor(.secondary)
                                if !a.isInServiceArea {
                                    Text(lang.t("address.out_of_area")).font(.caption).foregroundColor(Brand.danger)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .swipeActions {
                            Button(role: .destructive) {
                                Task { await vm.delete(a) }
                            } label: { Label(lang.t("common.delete"), systemImage: "trash") }
                        }
                    }
                }
                .refreshable { await vm.load() }
            }
        }
        .navigationTitle(lang.t("account.addresses"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { creating = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel(lang.t("address.new"))
            }
        }
        .sheet(item: $editing) { a in
            AddressEditorView(api: api, existing: a) { _ in Task { await vm.load() } }
        }
        .sheet(isPresented: $creating) {
            AddressEditorView(api: api, existing: nil) { _ in Task { await vm.load() } }
        }
        .task { await vm.load() }
    }
}
