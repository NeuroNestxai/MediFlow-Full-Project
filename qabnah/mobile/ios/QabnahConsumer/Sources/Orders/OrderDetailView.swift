import SwiftUI
import QabnahKit

@MainActor
final class OrderDetailViewModel: ObservableObject {
    @Published private(set) var state: Loadable<Order> = .idle
    @Published private(set) var isCancelling = false
    @Published var actionError: Error?

    private let api: APIClient
    private let realtime: RealtimeClient
    let orderId: String
    private var eventsTask: Task<Void, Never>?

    init(api: APIClient, realtime: RealtimeClient, orderId: String) {
        self.api = api
        self.realtime = realtime
        self.orderId = orderId
    }

    var order: Order? { state.value }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            state = .loaded(try await api.send(Endpoints.order(id: orderId)))
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            if state.value == nil { state = .failed(error) } else { actionError = error }
        }
    }

    /// Live refresh on `order.status_changed` / `delivery.status_changed`.
    func startLiveUpdates() {
        guard eventsTask == nil else { return }
        let channel = RealtimeChannel.order(orderId)
        eventsTask = Task { [weak self, realtime] in
            await realtime.subscribe(channel)
            for await event in realtime.events() where event.channel == channel {
                guard let self else { return }
                switch event.name {
                case RealtimeEventName.orderStatusChanged, RealtimeEventName.deliveryStatusChanged,
                     RealtimeEventName.deliveryAssigned:
                    await self.load()
                default: break
                }
            }
        }
    }

    func stopLiveUpdates() {
        eventsTask?.cancel()
        eventsTask = nil
        let channel = RealtimeChannel.order(orderId)
        Task { [realtime] in await realtime.unsubscribe(channel) }
    }

    func cancel(reason: String?) async {
        isCancelling = true
        defer { isCancelling = false }
        do {
            state = .loaded(try await api.send(Endpoints.cancelOrder(id: orderId, reason: reason)))
            actionError = nil
        } catch {
            actionError = error
            await load() // 409: state moved on; show the latest
        }
    }
}

struct OrderDetailView: View {
    @EnvironmentObject var lang: LanguageSettings
    @StateObject private var vm: OrderDetailViewModel
    @StateObject private var payment: PaymentFlow
    @State private var showCancel = false
    @State private var cancelReason = ""
    @State private var showSupport = false
    @State private var showRating = false
    @State private var showTracking = false
    private let api: APIClient
    private let realtime: RealtimeClient

    init(api: APIClient, realtime: RealtimeClient, orderId: String) {
        self.api = api
        self.realtime = realtime
        _vm = StateObject(wrappedValue: OrderDetailViewModel(api: api, realtime: realtime, orderId: orderId))
        _payment = StateObject(wrappedValue: PaymentFlow(api: api))
    }

    var body: some View {
        LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { order in
            List {
                statusSection(order)
                if let pin = order.delivery?.deliveryPin, !pin.isEmpty, !order.status.isFinal {
                    pinSection(pin)
                }
                if order.awaitingOnlinePayment {
                    Section {
                        Button(lang.t("order.pay_now")) { Task { await payment.start(order: order) } }
                            .buttonStyle(PrimaryButtonStyle())
                        InlineError(error: payment.error)
                    }
                }
                if !order.items.isEmpty { itemsSection(order) }
                if order.type == .c2c, let d = order.delivery { parcelSection(order, d) }
                moneySection(order)
                if !order.timeline.isEmpty { timelineSection(order) }
                actionsSection(order)
            }
            .refreshable { await vm.load() }
        }
        .navigationTitle(vm.order.map { $0.number } ?? lang.t("order.title"))
        .navigationBarTitleDisplayMode(.inline)
        .overlay { PaymentPollingOverlay(flow: payment) }
        .paymentSheet(payment) { _ in Task { await vm.load() } }
        .navigationDestination(isPresented: $showTracking) {
            TrackingView(api: api, realtime: realtime, orderId: vm.orderId)
        }
        .sheet(isPresented: $showSupport) {
            NewTicketView(api: api, orderId: vm.orderId) { _ in }
        }
        .sheet(isPresented: $showRating) {
            if let order = vm.order {
                RatingSheet(api: api, order: order) { Task { await vm.load() } }
            }
        }
        .alert(lang.t("order.cancel_title"), isPresented: $showCancel) {
            TextField(lang.t("order.cancel_reason"), text: $cancelReason)
            Button(lang.t("order.cancel_confirm"), role: .destructive) {
                let reason = cancelReason.trimmingCharacters(in: .whitespaces)
                Task { await vm.cancel(reason: reason.isEmpty ? nil : reason) }
            }
            Button(lang.t("common.back"), role: .cancel) {}
        } message: {
            Text(lang.t("order.cancel_message"))
        }
        .task {
            await vm.load()
            vm.startLiveUpdates()
        }
        .onDisappear { if !showTracking { vm.stopLiveUpdates() } }
    }

    private func statusSection(_ order: Order) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    StatusPill(text: lang.t("order.status.\(order.status.rawValue)"), color: order.status.color)
                    if let ds = order.delivery?.status, ds != .created {
                        StatusPill(text: lang.t("delivery.status.\(ds.rawValue)"), color: .secondary)
                    }
                }
                Text(order.merchant.map { lang.name($0) } ?? lang.t("orders.parcel")).font(.title3.bold())
                Text(lang.dateTime(order.createdAt)).font(.caption).foregroundColor(.secondary)
                if let reason = order.cancelReason, order.status == .cancelled || order.status == .rejected {
                    Text(reason).font(.footnote).foregroundColor(Brand.danger)
                }
                if let eta = order.delivery?.etaDropoffAt, let mins = Formatters.minutesUntil(eta), !order.status.isFinal {
                    Text(lang.f("tracking.eta_approx", mins)).font(.subheadline).foregroundColor(Brand.primary)
                }
                if order.isTrackable {
                    Button { showTracking = true } label: {
                        Label(lang.t("order.track"), systemImage: "map")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
                InlineError(error: vm.actionError)
            }
            .padding(.vertical, 4)
        }
    }

    private func pinSection(_ pin: String) -> some View {
        Section {
            VStack(spacing: 6) {
                Text(lang.t("order.pin_title")).font(.headline)
                Text(verbatim: pin)
                    .font(.system(size: 44, weight: .bold, design: .monospaced))
                    .kerning(8)
                    .foregroundColor(Brand.primary)
                    .environment(\.layoutDirection, .leftToRight)
                Text(lang.t("order.pin_hint")).font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(lang.t("order.pin_title")): \(pin.map(String.init).joined(separator: " "))")
        }
    }

    private func itemsSection(_ order: Order) -> some View {
        Section(lang.t("order.items")) {
            ForEach(order.items) { item in
                HStack(alignment: .top) {
                    Text(lang.digits("\(item.quantity)×")).foregroundColor(.secondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(lang.name(item))
                        if !item.options.isEmpty {
                            Text(item.options.map { lang.name($0) }.joined(separator: "، "))
                                .font(.caption).foregroundColor(.secondary)
                        }
                        if let n = item.notes { Text(n).font(.caption).italic().foregroundColor(.secondary) }
                    }
                    Spacer()
                    Text(lang.money(item.lineTotalBaisa))
                }
            }
        }
    }

    private func parcelSection(_ order: Order, _ d: Delivery) -> some View {
        Section(lang.t("send.package")) {
            if let size = d.packageSize { KeyValueRow(label: lang.t("send.size"), value: lang.t("package.\(size)", fallback: size)) }
            if let desc = d.packageDescription { Text(desc) }
            if let p = d.pickup?.address { KeyValueRow(label: lang.t("send.pickup"), value: p) }
            if let p = d.dropoff?.address { KeyValueRow(label: lang.t("send.dropoff"), value: p) }
            if let payer = order.codPayer, order.paymentMethod == .cod {
                KeyValueRow(label: lang.t("send.cod_payer"), value: lang.t("cod_payer.\(payer)", fallback: payer))
            }
        }
    }

    private func moneySection(_ order: Order) -> some View {
        Section(lang.t("checkout.summary")) {
            if order.subtotalBaisa > 0 {
                KeyValueRow(label: lang.t("checkout.subtotal"), value: lang.money(order.subtotalBaisa))
            }
            KeyValueRow(label: lang.t("checkout.delivery_fee"), value: lang.money(order.deliveryFeeBaisa))
            if order.serviceFeeBaisa > 0 {
                KeyValueRow(label: lang.t("checkout.service_fee"), value: lang.money(order.serviceFeeBaisa))
            }
            if order.discountBaisa > 0 {
                KeyValueRow(label: lang.t("checkout.discount"), value: "-" + lang.money(order.discountBaisa), valueColor: Brand.success)
            }
            if order.vatBaisa > 0 {
                KeyValueRow(label: lang.t("checkout.vat_included"), value: lang.money(order.vatBaisa))
            }
            KeyValueRow(label: lang.t("checkout.total"), value: lang.money(order.totalBaisa), bold: true)
            KeyValueRow(label: lang.t("checkout.payment"),
                        value: "\(lang.t("payment.\(order.paymentMethod.rawValue)")) · \(lang.t("payment_status.\(order.paymentStatus)", fallback: order.paymentStatus))")
            if order.paymentMethod == .cod && order.codAmountBaisa > 0 && !order.status.isFinal {
                Text(lang.f("order.cod_hint", lang.money(order.codAmountBaisa))).font(.footnote).foregroundColor(.secondary)
            }
        }
    }

    private func timelineSection(_ order: Order) -> some View {
        Section(lang.t("order.timeline")) {
            ForEach(order.timeline.sorted { $0.at < $1.at }) { entry in
                HStack(alignment: .top, spacing: 10) {
                    Circle().fill(Brand.primary).frame(width: 8, height: 8).padding(.top, 6).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(lang.t("order.status.\(entry.status)", fallback: entry.status))
                        if let note = entry.note { Text(note).font(.caption).foregroundColor(.secondary) }
                    }
                    Spacer()
                    Text(lang.time(entry.at)).font(.caption).foregroundColor(.secondary)
                }
            }
        }
    }

    private func actionsSection(_ order: Order) -> some View {
        Section {
            if order.canRate {
                Button { showRating = true } label: { Label(lang.t("order.rate"), systemImage: "star") }
            }
            Button { showSupport = true } label: { Label(lang.t("order.get_help"), systemImage: "questionmark.circle") }
            if let phone = order.merchant?.contactPhone, let url = ExternalLinks.tel(phone), !order.status.isFinal {
                Link(destination: url) { Label(lang.t("order.call_store"), systemImage: "phone") }
            }
            if order.isCancellable {
                Button(role: .destructive) { showCancel = true } label: {
                    if vm.isCancelling { ProgressView() } else { Label(lang.t("order.cancel"), systemImage: "xmark.circle") }
                }
                .disabled(vm.isCancelling)
            }
        }
    }
}

@MainActor
final class RatingViewModel: ObservableObject {
    @Published var captainScore = 0
    @Published var captainComment = ""
    @Published var merchantScore = 0
    @Published var merchantComment = ""
    @Published private(set) var isSubmitting = false
    @Published var error: Error?
    private let api: APIClient
    let order: Order

    init(api: APIClient, order: Order) {
        self.api = api
        self.order = order
    }

    var hasCaptain: Bool { order.delivery?.captain != nil }
    var hasMerchant: Bool { order.merchant != nil }
    var canSubmit: Bool { (captainScore > 0 || merchantScore > 0) && !isSubmitting }

    func submit() async -> Bool {
        isSubmitting = true
        defer { isSubmitting = false }
        let input = RatingInput(
            captain: captainScore > 0 ? .init(score: captainScore, comment: captainComment) : nil,
            merchant: merchantScore > 0 ? .init(score: merchantScore, comment: merchantComment) : nil)
        do {
            _ = try await api.send(Endpoints.rateOrder(id: order.id, input))
            return true
        } catch {
            self.error = error
            return false
        }
    }
}

struct RatingSheet: View {
    @EnvironmentObject var lang: LanguageSettings
    @Environment(\.dismiss) var dismiss
    @StateObject private var vm: RatingViewModel
    let onDone: () -> Void

    init(api: APIClient, order: Order, onDone: @escaping () -> Void) {
        _vm = StateObject(wrappedValue: RatingViewModel(api: api, order: order))
        self.onDone = onDone
    }

    var body: some View {
        NavigationStack {
            Form {
                if vm.hasCaptain {
                    Section(lang.f("rating.captain", vm.order.delivery?.captain?.firstName ?? "")) {
                        StarPicker(score: $vm.captainScore)
                        TextField(lang.t("rating.comment"), text: $vm.captainComment, axis: .vertical)
                    }
                }
                if let m = vm.order.merchant {
                    Section(lang.f("rating.merchant", lang.name(m))) {
                        StarPicker(score: $vm.merchantScore)
                        TextField(lang.t("rating.comment"), text: $vm.merchantComment, axis: .vertical)
                    }
                }
                if vm.error != nil { Section { InlineError(error: vm.error) } }
            }
            .navigationTitle(lang.t("order.rate"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(lang.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(lang.t("common.send")) {
                        Task {
                            if await vm.submit() {
                                onDone()
                                dismiss()
                            }
                        }
                    }
                    .disabled(!vm.canSubmit)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

struct StarPicker: View {
    @EnvironmentObject var lang: LanguageSettings
    @Binding var score: Int

    var body: some View {
        HStack(spacing: 10) {
            ForEach(1...5, id: \.self) { i in
                Button { score = i } label: {
                    Image(systemName: i <= score ? "star.fill" : "star")
                        .font(.title2)
                        .foregroundColor(Brand.accent)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(lang.f("rating.stars_a11y", i))
                .accessibilityAddTraits(i == score ? .isSelected : [])
            }
        }
        .frame(maxWidth: .infinity)
    }
}
