import SwiftUI
import QabnahKit

@MainActor
final class TicketsViewModel: ObservableObject {
    @Published private(set) var state: Loadable<[Ticket]> = .idle
    private let api: APIClient

    init(api: APIClient) { self.api = api }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            state = .loaded(try await api.send(Endpoints.tickets()).items)
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            state = .failed(error)
        }
    }
}

struct TicketsListView: View {
    @EnvironmentObject var lang: LanguageSettings
    @StateObject private var vm: TicketsViewModel
    @State private var showNew = false
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
        _vm = StateObject(wrappedValue: TicketsViewModel(api: api))
    }

    var body: some View {
        LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { tickets in
            if tickets.isEmpty {
                EmptyStateView(systemImage: "questionmark.bubble", title: lang.t("support.empty"),
                               message: lang.t("support.empty_hint"))
            } else {
                List(tickets) { t in
                    NavigationLink {
                        TicketDetailView(api: api, ticketId: t.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(t.subject).font(.headline)
                                Spacer()
                                StatusPill(text: lang.t("ticket.status.\(t.status)", fallback: t.status),
                                           color: t.isClosed ? .secondary : Brand.primary)
                            }
                            Text(verbatim: "#\(t.number)").font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
                .refreshable { await vm.load() }
            }
        }
        .navigationTitle(lang.t("support.title"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showNew = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel(lang.t("support.new"))
            }
        }
        .sheet(isPresented: $showNew) {
            NewTicketView(api: api, orderId: nil) { _ in Task { await vm.load() } }
        }
        .task { await vm.load() }
    }
}

@MainActor
final class TicketDetailViewModel: ObservableObject {
    @Published private(set) var state: Loadable<Ticket> = .idle
    @Published var reply = ""
    @Published private(set) var isSending = false
    @Published var sendError: Error?
    private let api: APIClient
    let ticketId: String

    init(api: APIClient, ticketId: String) {
        self.api = api
        self.ticketId = ticketId
    }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            state = .loaded(try await api.send(Endpoints.ticket(id: ticketId)))
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            state = .failed(error)
        }
    }

    func send() async {
        let body = reply.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        isSending = true
        defer { isSending = false }
        do {
            _ = try await api.send(Endpoints.replyTicket(id: ticketId, body: body))
            reply = ""
            sendError = nil
            await load()
        } catch {
            sendError = error
        }
    }
}

struct TicketDetailView: View {
    @EnvironmentObject var lang: LanguageSettings
    @StateObject private var vm: TicketDetailViewModel

    init(api: APIClient, ticketId: String) {
        _vm = StateObject(wrappedValue: TicketDetailViewModel(api: api, ticketId: ticketId))
    }

    var body: some View {
        LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { ticket in
            VStack(spacing: 0) {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        Text(ticket.subject).font(.title3.bold())
                        HStack {
                            Text(verbatim: "#\(ticket.number)")
                            if let c = ticket.category { Text(lang.t("ticket.category.\(c.rawValue)", fallback: c.rawValue)) }
                        }
                        .font(.caption).foregroundColor(.secondary)
                        ForEach(ticket.messages.filter { !$0.isInternal }) { m in
                            let staff = m.author?.isStaff ?? false
                            VStack(alignment: .leading, spacing: 4) {
                                Text(staff ? lang.t("support.agent") : (m.author?.fullName ?? ""))
                                    .font(.caption.bold())
                                Text(m.body)
                                if let at = m.createdAt {
                                    Text(lang.dateTime(at)).font(.caption2).foregroundColor(.secondary)
                                }
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(staff ? Brand.primary.opacity(0.1) : Color(.secondarySystemGroupedBackground))
                            .clipShape(RoundedRectangle(cornerRadius: Brand.radiusMd))
                        }
                    }
                    .padding()
                }
                .refreshable { await vm.load() }

                if !ticket.isClosed {
                    VStack(spacing: 6) {
                        InlineError(error: vm.sendError)
                        HStack {
                            TextField(lang.t("support.reply_placeholder"), text: $vm.reply, axis: .vertical)
                                .lineLimit(1...4)
                                .textFieldStyle(.roundedBorder)
                            Button {
                                Task { await vm.send() }
                            } label: {
                                if vm.isSending { ProgressView() } else { Image(systemName: "paperplane.fill") }
                            }
                            .disabled(vm.reply.trimmingCharacters(in: .whitespaces).isEmpty || vm.isSending)
                            .accessibilityLabel(lang.t("support.send"))
                        }
                    }
                    .padding()
                    .background(.bar)
                }
            }
        }
        .navigationTitle(lang.t("support.ticket"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
    }
}

@MainActor
final class NewTicketViewModel: ObservableObject {
    @Published var subject = ""
    @Published var category: TicketCategory
    @Published var message = ""
    @Published private(set) var isSubmitting = false
    @Published var error: Error?
    let orderId: String?
    private let api: APIClient

    init(api: APIClient, orderId: String?) {
        self.api = api
        self.orderId = orderId
        self.category = orderId == nil ? .account : .orderIssue
    }

    var canSubmit: Bool {
        !subject.trimmingCharacters(in: .whitespaces).isEmpty
            && !message.trimmingCharacters(in: .whitespaces).isEmpty && !isSubmitting
    }

    func submit() async -> Ticket? {
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let t = try await api.send(Endpoints.createTicket(TicketCreateInput(
                subject: subject.trimmingCharacters(in: .whitespacesAndNewlines), category: category,
                orderId: orderId, message: message.trimmingCharacters(in: .whitespacesAndNewlines))))
            error = nil
            return t
        } catch {
            self.error = error
            return nil
        }
    }
}

struct NewTicketView: View {
    @EnvironmentObject var lang: LanguageSettings
    @Environment(\.dismiss) var dismiss
    @StateObject private var vm: NewTicketViewModel
    let onCreated: (Ticket) -> Void

    init(api: APIClient, orderId: String?, onCreated: @escaping (Ticket) -> Void) {
        _vm = StateObject(wrappedValue: NewTicketViewModel(api: api, orderId: orderId))
        self.onCreated = onCreated
    }

    var body: some View {
        NavigationStack {
            Form {
                if let orderId = vm.orderId {
                    Section { Label(lang.f("support.about_order", String(orderId.prefix(8))), systemImage: "bag") }
                }
                Section {
                    Picker(lang.t("support.category"), selection: $vm.category) {
                        ForEach(TicketCategory.knownCases, id: \.self) { c in
                            Text(lang.t("ticket.category.\(c.rawValue)")).tag(c)
                        }
                    }
                    TextField(lang.t("support.subject"), text: $vm.subject)
                    TextField(lang.t("support.message"), text: $vm.message, axis: .vertical)
                        .lineLimit(4...10)
                }
                if vm.error != nil {
                    Section { InlineError(error: vm.error) }
                }
            }
            .navigationTitle(lang.t("support.new"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(lang.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(lang.t("common.send")) {
                        Task {
                            if let t = await vm.submit() {
                                onCreated(t)
                                dismiss()
                            }
                        }
                    }
                    .disabled(!vm.canSubmit)
                }
            }
        }
    }
}
