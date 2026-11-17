import SwiftUI
import QabnahKit

struct CaptainProfileView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var store: CaptainStore
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            List {
                if let p = store.profile {
                    Section {
                        HStack(spacing: 12) {
                            Image(systemName: "person.crop.circle.fill")
                                .font(.system(size: 48))
                                .foregroundColor(Brand.primary)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.fullName.isEmpty ? (session.me?.user.fullName ?? "") : p.fullName).font(.headline)
                                Text(verbatim: PhoneNumber.display(p.phone.isEmpty ? (session.me?.user.phone ?? "") : p.phone))
                                    .font(.subheadline).foregroundColor(.secondary)
                                StatusPill(text: lang.t("captain_status.\(p.status.rawValue)"),
                                           color: p.status == .active ? Brand.success : Brand.accent)
                            }
                        }
                        HStack {
                            KeyValueRow(label: lang.t("profile.rating"),
                                        value: p.ratingCount > 0 ? "★ \(Formatters.rating(p.ratingAvg, language: lang.language))" : "—")
                        }
                        KeyValueRow(label: lang.t("profile.acceptance"),
                                    value: lang.digits("\(Int((p.acceptanceRate * 100).rounded()))%"))
                    }
                    Section(lang.t("register.vehicle")) {
                        KeyValueRow(label: lang.t("register.vehicle_type"), value: lang.t("vehicle.\(p.vehicleType?.rawValue ?? "bike")"))
                        if let plate = p.vehiclePlate { KeyValueRow(label: lang.t("register.plate"), value: plate) }
                        let model = [p.vehicleColor, p.vehicleMake, p.vehicleModel].compactMap { $0 }.joined(separator: " ")
                        if !model.isEmpty { KeyValueRow(label: lang.t("register.model"), value: model) }
                        NavigationLink { RegistrationView(api: session.api, existing: p) } label: {
                            Text(lang.t("profile.edit_vehicle"))
                        }
                    }
                    Section(lang.t("profile.onboarding")) {
                        NavigationLink { DocumentsView() } label: {
                            HStack {
                                Label(lang.t("onboarding.documents"), systemImage: "doc.text")
                                Spacer()
                                if !p.missingDocuments.isEmpty {
                                    StatusPill(text: lang.digits("\(p.missingDocuments.count)"), color: Brand.danger)
                                }
                            }
                        }
                        NavigationLink { ZonesView(api: session.api) } label: {
                            Label(lang.t("onboarding.zones"), systemImage: "map")
                        }
                        NavigationLink { AvailabilityView() } label: {
                            Label(lang.t("onboarding.availability"), systemImage: "calendar")
                        }
                    }
                } else {
                    Section { LoadableView(state: store.profileState, retry: { Task { await store.refreshProfile() } }) { _ in EmptyView() } }
                }
                Section {
                    NavigationLink { TicketsListView(api: session.api) } label: {
                        Label(lang.t("support.title"), systemImage: "questionmark.bubble")
                    }
                }
                Section(lang.t("account.language")) { LanguagePicker() }
                AccountDataSection()
                Section {
                    Button(role: .destructive) { confirmSignOut = true } label: {
                        Label(lang.t("account.sign_out"), systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    .disabled(store.isOnline)
                    if store.isOnline {
                        Text(lang.t("profile.go_offline_first")).font(.footnote).foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle(lang.t("tab.profile"))
            .refreshable { await store.refreshProfile() }
            .confirmationDialog(lang.t("account.sign_out_confirm"), isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button(lang.t("account.sign_out"), role: .destructive) { Task { await session.signOut() } }
                Button(lang.t("common.cancel"), role: .cancel) {}
            }
        }
    }
}
