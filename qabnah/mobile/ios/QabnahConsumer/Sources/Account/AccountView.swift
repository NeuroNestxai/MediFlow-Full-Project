import SwiftUI
import QabnahKit

struct AccountView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @State private var confirmSignOut = false
    @State private var unread = 0

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink {
                        ProfileEditView()
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "person.crop.circle.fill")
                                .font(.system(size: 44))
                                .foregroundColor(Brand.primary)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading) {
                                Text(session.me?.user.fullName.isEmpty == false ? session.me!.user.fullName : lang.t("account.no_name"))
                                    .font(.headline)
                                if let phone = session.me?.user.phone {
                                    Text(verbatim: PhoneNumber.display(phone)).font(.subheadline).foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                    if session.meError != nil && session.me == nil {
                        InlineError(error: session.meError)
                    }
                }
                Section {
                    NavigationLink { AddressesView(api: session.api) } label: {
                        Label(lang.t("account.addresses"), systemImage: "mappin.and.ellipse")
                    }
                    NavigationLink { NotificationsView(api: session.api) { unread = $0 } } label: {
                        HStack {
                            Label(lang.t("account.notifications"), systemImage: "bell")
                            Spacer()
                            if unread > 0 {
                                Text(lang.digits("\(unread)"))
                                    .font(.caption.bold())
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 8).padding(.vertical, 2)
                                    .background(Brand.accent, in: Capsule())
                            }
                        }
                    }
                    NavigationLink { TicketsListView(api: session.api) } label: {
                        Label(lang.t("support.title"), systemImage: "questionmark.bubble")
                    }
                }
                Section(lang.t("account.language")) {
                    LanguagePicker()
                }
                Section {
                    Button(role: .destructive) { confirmSignOut = true } label: {
                        Label(lang.t("account.sign_out"), systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
                Section {
                    Text(verbatim: "Qabnah · \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle(lang.t("tab.account"))
            .refreshable { await session.loadMe() }
            .confirmationDialog(lang.t("account.sign_out_confirm"), isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button(lang.t("account.sign_out"), role: .destructive) { Task { await session.signOut() } }
                Button(lang.t("common.cancel"), role: .cancel) {}
            }
            .task {
                if session.me == nil { await session.loadMe() }
                if let page = try? await session.api.send(Endpoints.notifications(limit: 1)) { unread = page.unread }
            }
        }
    }
}

@MainActor
final class ProfileEditViewModel: ObservableObject {
    @Published var fullName = ""
    @Published var email = ""
    @Published private(set) var isSaving = false
    @Published var error: Error?
    @Published private(set) var saved = false

    func load(from me: Me?) {
        fullName = me?.user.fullName ?? ""
        email = me?.user.email ?? ""
    }

    func save(session: SessionStore) async {
        isSaving = true
        defer { isSaving = false }
        let name = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        let mail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            session.me = try await session.api.send(Endpoints.updateMe(ProfileUpdateInput(
                fullName: name.isEmpty ? nil : name, email: mail.isEmpty ? nil : mail)))
            error = nil
            saved = true
        } catch {
            self.error = error
        }
    }
}

struct ProfileEditView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @Environment(\.dismiss) var dismiss
    @StateObject private var vm = ProfileEditViewModel()

    var body: some View {
        Form {
            Section {
                TextField(lang.t("auth.full_name"), text: $vm.fullName).textContentType(.name)
                TextField(lang.t("account.email"), text: $vm.email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                if let phone = session.me?.user.phone {
                    KeyValueRow(label: lang.t("account.phone"), value: PhoneNumber.display(phone))
                }
            }
            if vm.error != nil { Section { InlineError(error: vm.error) } }
        }
        .navigationTitle(lang.t("account.profile"))
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if vm.isSaving {
                    ProgressView()
                } else {
                    Button(lang.t("common.save")) {
                        Task {
                            await vm.save(session: session)
                            if vm.saved { dismiss() }
                        }
                    }
                }
            }
        }
        .onAppear { vm.load(from: session.me) }
    }
}

@MainActor
final class NotificationsViewModel: ObservableObject {
    @Published private(set) var state: Loadable<NotificationPage> = .idle
    private let api: APIClient

    init(api: APIClient) { self.api = api }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            state = .loaded(try await api.send(Endpoints.notifications(limit: 50)))
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            state = .failed(error)
        }
    }

    func markRead(_ n: AppNotification) async {
        guard !n.isRead, var page = state.value else { return }
        do {
            _ = try await api.send(Endpoints.markNotificationRead(id: n.id))
            if let i = page.items.firstIndex(where: { $0.id == n.id }) {
                page.items[i].readAt = Date()
                page.unread = max(0, page.unread - 1)
                state = .loaded(page)
            }
        } catch {
            // Non-critical; the badge corrects itself on the next load.
        }
    }
}

struct NotificationsView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var router: ConsumerRouter
    @StateObject private var vm: NotificationsViewModel
    let onUnreadChange: (Int) -> Void

    init(api: APIClient, onUnreadChange: @escaping (Int) -> Void) {
        _vm = StateObject(wrappedValue: NotificationsViewModel(api: api))
        self.onUnreadChange = onUnreadChange
    }

    var body: some View {
        LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { page in
            if page.items.isEmpty {
                EmptyStateView(systemImage: "bell.slash", title: lang.t("notifications.empty"))
            } else {
                List(page.items) { n in
                    Button {
                        Task {
                            await vm.markRead(n)
                            if let id = n.orderId { router.showOrder(id) }
                        }
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Circle()
                                .fill(n.isRead ? Color.clear : Brand.accent)
                                .frame(width: 8, height: 8)
                                .padding(.top, 6)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(n.title).font(n.isRead ? .body : .body.bold())
                                Text(n.body).font(.subheadline).foregroundColor(.secondary)
                                if let at = n.createdAt {
                                    Text(lang.dateTime(at)).font(.caption2).foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(n.isRead ? "" : lang.t("notifications.unread"))
                }
                .refreshable { await vm.load() }
            }
        }
        .navigationTitle(lang.t("account.notifications"))
        .task { await vm.load() }
        .onChange(of: vm.state.value?.unread ?? 0) { onUnreadChange($0) }
    }
}
