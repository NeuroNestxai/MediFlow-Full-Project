import SwiftUI
import QabnahKit

@MainActor
final class RegistrationViewModel: ObservableObject {
    @Published var vehicleType: VehicleType = .bike
    @Published var vehicleMake = ""
    @Published var vehicleModel = ""
    @Published var vehiclePlate = ""
    @Published var vehicleColor = ""
    @Published var nationalIdNumber = ""
    @Published var nationality = "OM"
    @Published var dateOfBirth = Calendar.current.date(byAdding: .year, value: -25, to: Date()) ?? Date()
    @Published var bankName = ""
    @Published var iban = ""
    @Published private(set) var isSubmitting = false
    @Published var error: Error?

    private let api: APIClient
    /// When editing an existing profile (PATCH) instead of registering.
    let existing: CaptainProfile?

    init(api: APIClient, existing: CaptainProfile? = nil) {
        self.api = api
        self.existing = existing
        if let p = existing {
            vehicleType = p.vehicleType ?? .bike
            vehicleMake = p.vehicleMake ?? ""
            vehicleModel = p.vehicleModel ?? ""
            vehiclePlate = p.vehiclePlate ?? ""
            vehicleColor = p.vehicleColor ?? ""
            nationalIdNumber = p.nationalIdNumber ?? ""
            nationality = p.nationality ?? "OM"
            if let dob = p.dateOfBirth.flatMap(MuscatCalendar.date(fromDay:)) { dateOfBirth = dob }
            bankName = p.bankName ?? ""
            iban = p.iban ?? ""
        }
    }

    static let dobRange: ClosedRange<Date> = {
        let cal = Calendar.current
        let now = Date()
        return (cal.date(byAdding: .year, value: -75, to: now) ?? now)...(cal.date(byAdding: .year, value: -18, to: now) ?? now)
    }()

    private func trimmed(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

    var normalizedIban: String { trimmed(iban).replacingOccurrences(of: " ", with: "").uppercased() }

    /// Omani IBANs are 23 characters starting with "OM"; other formats are left to the server.
    var ibanLooksValid: Bool {
        let i = normalizedIban
        if i.isEmpty { return false }
        if i.hasPrefix("OM") { return i.count == 23 }
        return i.count >= 15 && i.count <= 34
    }

    var canSubmit: Bool {
        !trimmed(vehiclePlate).isEmpty && !trimmed(vehicleModel).isEmpty && !trimmed(nationalIdNumber).isEmpty
            && !trimmed(nationality).isEmpty && !trimmed(bankName).isEmpty && ibanLooksValid && !isSubmitting
    }

    var input: CaptainProfileInput {
        func opt(_ s: String) -> String? { trimmed(s).isEmpty ? nil : trimmed(s) }
        return CaptainProfileInput(
            vehicleType: vehicleType, vehicleMake: opt(vehicleMake), vehicleModel: opt(vehicleModel),
            vehiclePlate: opt(vehiclePlate)?.uppercased(), vehicleColor: opt(vehicleColor),
            nationalIdNumber: opt(Digits.ascii(nationalIdNumber)), nationality: opt(nationality)?.uppercased(),
            dateOfBirth: MuscatCalendar.dayString(dateOfBirth), bankName: opt(bankName), iban: normalizedIban)
    }

    func submit() async -> CaptainProfile? {
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let p: CaptainProfile
            if existing != nil {
                p = try await api.send(Endpoints.updateCaptainProfile(input))
            } else {
                p = try await api.send(Endpoints.captainRegister(input))
            }
            error = nil
            return p
        } catch {
            self.error = error
            return nil
        }
    }
}

/// `POST /captain/register` (or `PATCH /captain/profile` when editing).
struct RegistrationView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var store: CaptainStore
    @Environment(\.dismiss) var dismiss
    @StateObject private var vm: RegistrationViewModel
    private let isEditing: Bool

    init(api: APIClient, existing: CaptainProfile? = nil) {
        isEditing = existing != nil
        _vm = StateObject(wrappedValue: RegistrationViewModel(api: api, existing: existing))
    }

    var body: some View {
        RegistrationForm(vm: vm, isEditing: isEditing) { profile in
            store.setProfile(profile)
            Task { await session.loadMe() }
            if isEditing { dismiss() }
        }
    }
}

private struct RegistrationForm: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @ObservedObject var vm: RegistrationViewModel
    let isEditing: Bool
    let onDone: (CaptainProfile) -> Void

    var body: some View {
        Form {
            if !isEditing {
                Section {
                    Text(lang.t("register.intro")).font(.subheadline).foregroundColor(.secondary)
                }
            } else if vm.existing?.status == .active {
                Section {
                    Label(lang.t("register.vehicle_change_warning"), systemImage: "exclamationmark.triangle")
                        .font(.footnote).foregroundColor(Brand.accent)
                }
            }
            Section(lang.t("register.vehicle")) {
                Picker(lang.t("register.vehicle_type"), selection: $vm.vehicleType) {
                    ForEach(VehicleType.knownCases, id: \.self) { v in
                        Text(lang.t("vehicle.\(v.rawValue)")).tag(v)
                    }
                }
                .pickerStyle(.segmented)
                TextField(lang.t("register.make"), text: $vm.vehicleMake)
                TextField(lang.t("register.model"), text: $vm.vehicleModel)
                TextField(lang.t("register.plate"), text: $vm.vehiclePlate)
                    .textInputAutocapitalization(.characters)
                TextField(lang.t("register.color"), text: $vm.vehicleColor)
            }
            Section(lang.t("register.identity")) {
                TextField(lang.t("register.national_id"), text: $vm.nationalIdNumber).keyboardType(.numberPad)
                TextField(lang.t("register.nationality"), text: $vm.nationality)
                    .textInputAutocapitalization(.characters)
                DatePicker(lang.t("register.dob"), selection: $vm.dateOfBirth, in: RegistrationViewModel.dobRange,
                           displayedComponents: .date)
            }
            Section {
                TextField(lang.t("register.bank"), text: $vm.bankName)
                TextField(lang.t("register.iban"), text: $vm.iban)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .environment(\.layoutDirection, .leftToRight)
                if !vm.iban.isEmpty && !vm.ibanLooksValid {
                    Text(lang.t("register.iban_invalid")).font(.caption).foregroundColor(Brand.danger)
                }
            } header: {
                Text(lang.t("register.payout"))
            } footer: {
                Text(lang.t("register.payout_hint"))
            }
            if vm.error != nil { Section { InlineError(error: vm.error) } }
            Section {
                Button {
                    Task { if let p = await vm.submit() { onDone(p) } }
                } label: {
                    if vm.isSubmitting { ProgressView().tint(.white) } else { Text(lang.t(isEditing ? "common.save" : "register.submit")) }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!vm.canSubmit)
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if !isEditing {
                Section {
                    Button(lang.t("account.sign_out"), role: .destructive) { Task { await session.signOut() } }
                }
            }
        }
        .navigationTitle(lang.t(isEditing ? "profile.edit_vehicle" : "register.title"))
    }
}
