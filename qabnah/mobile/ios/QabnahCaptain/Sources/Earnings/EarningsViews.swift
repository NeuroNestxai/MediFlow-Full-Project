import SwiftUI
import QabnahKit

// MARK: - Deliveries history

@MainActor
final class DeliveriesHistoryViewModel: ObservableObject {
    @Published private(set) var state: Loadable<[CaptainDelivery]> = .idle
    @Published private(set) var hasMore = false
    @Published private(set) var isLoadingMore = false
    private let api: APIClient
    private let pageSize = 20

    init(api: APIClient) { self.api = api }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            let r = try await api.send(Endpoints.captainDeliveries(status: .history, limit: pageSize, offset: 0))
            state = .loaded(r.items)
            hasMore = (r.total ?? 0) > r.items.count
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            state = .failed(error)
        }
    }

    func loadMore() async {
        guard hasMore, !isLoadingMore, let current = state.value else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let r = try await api.send(Endpoints.captainDeliveries(status: .history, limit: pageSize, offset: current.count))
            let all = current + r.items.filter { item in !current.contains { $0.id == item.id } }
            state = .loaded(all)
            hasMore = !r.items.isEmpty && (r.total ?? 0) > all.count
        } catch {
            hasMore = false
        }
    }
}

struct DeliveriesHistoryView: View {
    @EnvironmentObject var lang: LanguageSettings
    @StateObject private var vm: DeliveriesHistoryViewModel

    init(api: APIClient) { _vm = StateObject(wrappedValue: DeliveriesHistoryViewModel(api: api)) }

    var body: some View {
        NavigationStack {
            LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { items in
                if items.isEmpty {
                    EmptyStateView(systemImage: "shippingbox", title: lang.t("history.empty"))
                } else {
                    List {
                        ForEach(items) { d in
                            HistoryRow(delivery: d)
                                .onAppear { if d.id == items.last?.id { Task { await vm.loadMore() } } }
                        }
                        if vm.isLoadingMore { ProgressView().frame(maxWidth: .infinity) }
                    }
                    .listStyle(.plain)
                }
            }
            .refreshable { await vm.load() }
            .navigationTitle(lang.t("tab.deliveries"))
            .task { await vm.load() }
        }
    }
}

struct HistoryRow: View {
    @EnvironmentObject var lang: LanguageSettings
    let delivery: CaptainDelivery

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(delivery.merchantName ?? lang.t("offer.parcel")).font(.headline)
                if let n = delivery.orderNumber {
                    Text(verbatim: n).font(.caption.monospaced()).foregroundColor(.secondary)
                }
                if let at = delivery.deliveredAt ?? delivery.assignedAt {
                    Text(lang.dateTime(at)).font(.caption2).foregroundColor(.secondary)
                }
                if let reason = delivery.failureReason, delivery.status == .failed {
                    Text(reason).font(.caption).foregroundColor(Brand.danger)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(lang.money(delivery.earningBaisa)).font(.subheadline.bold()).foregroundColor(Brand.success)
                StatusPill(text: lang.t("delivery.status.\(delivery.status.rawValue)"),
                           color: delivery.status == .delivered ? Brand.success : (delivery.status == .failed ? Brand.danger : .secondary))
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Earnings

@MainActor
final class EarningsViewModel: ObservableObject {
    @Published var preset: DateRangePreset = .today
    @Published private(set) var state: Loadable<Earnings> = .idle
    private let api: APIClient

    init(api: APIClient) { self.api = api }

    func load() async {
        state = state.value == nil ? .loading : state
        let range = preset.range()
        do {
            state = .loaded(try await api.send(Endpoints.captainEarnings(from: range.from, to: range.to)))
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            state = .failed(error)
        }
    }
}

struct EarningsView: View {
    @EnvironmentObject var lang: LanguageSettings
    @StateObject private var vm: EarningsViewModel
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
        _vm = StateObject(wrappedValue: EarningsViewModel(api: api))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker(lang.t("earnings.period"), selection: $vm.preset) {
                    ForEach(DateRangePreset.allCases) { p in Text(lang.t("earnings.preset.\(p.rawValue)")).tag(p) }
                }
                .pickerStyle(.segmented)
                .padding()

                LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { e in
                    List {
                        Section {
                            HStack(spacing: 12) {
                                stat(lang.t("earnings.earned"), lang.money(e.earningsBaisa), Brand.success)
                                stat(lang.t("earnings.deliveries"), lang.digits("\(e.deliveriesCount)"), Brand.primary)
                            }
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                            KeyValueRow(label: lang.t("earnings.cod_collected"), value: lang.money(e.codCollectedBaisa))
                        }
                        Section(lang.t("earnings.balance")) {
                            balance(e)
                            NavigationLink { PayoutsView(api: api) } label: {
                                Label(lang.t("earnings.payouts"), systemImage: "building.columns")
                            }
                        }
                        if !e.entries.isEmpty {
                            Section(lang.t("earnings.entries")) {
                                ForEach(e.entries) { entry in
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(lang.t("ledger.\(entry.entryType)", fallback: entry.entryType))
                                            Text(entry.description).font(.caption).foregroundColor(.secondary)
                                            if let at = entry.createdAt {
                                                Text(lang.dateTime(at)).font(.caption2).foregroundColor(.secondary)
                                            }
                                        }
                                        Spacer()
                                        Text(lang.money(entry.amountBaisa))
                                            .foregroundColor(entry.amountBaisa >= 0 ? Brand.success : Brand.danger)
                                    }
                                    .accessibilityElement(children: .combine)
                                }
                            }
                        }
                    }
                }
                .refreshable { await vm.load() }
            }
            .navigationTitle(lang.t("tab.earnings"))
            .task(id: vm.preset) { await vm.load() }
        }
    }

    private func stat(_ title: String, _ value: String, _ color: Color) -> some View {
        VStack(spacing: 4) {
            Text(title).font(.caption).foregroundColor(.secondary)
            Text(value).font(.title3.bold()).foregroundColor(color).minimumScaleFactor(0.7).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .card()
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func balance(_ e: Earnings) -> some View {
        switch e.balanceDirection {
        case .platformOwesCaptain(let amount):
            VStack(alignment: .leading, spacing: 4) {
                Text(lang.f("earnings.we_owe_you", lang.money(amount))).font(.headline).foregroundColor(Brand.success)
                Text(lang.t("earnings.we_owe_you_hint")).font(.footnote).foregroundColor(.secondary)
            }
        case .captainOwesPlatform(let amount):
            VStack(alignment: .leading, spacing: 4) {
                Text(lang.f("earnings.you_owe", lang.money(amount))).font(.headline).foregroundColor(Brand.danger)
                Text(lang.t("earnings.you_owe_hint")).font(.footnote).foregroundColor(.secondary)
            }
        case .settled:
            Text(lang.t("earnings.settled")).font(.headline)
        }
    }
}

// MARK: - Payouts

@MainActor
final class PayoutsViewModel: ObservableObject {
    @Published private(set) var state: Loadable<[Settlement]> = .idle
    private let api: APIClient

    init(api: APIClient) { self.api = api }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            state = .loaded(try await api.send(Endpoints.captainPayouts()).items)
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            state = .failed(error)
        }
    }
}

struct PayoutsView: View {
    @EnvironmentObject var lang: LanguageSettings
    @StateObject private var vm: PayoutsViewModel

    init(api: APIClient) { _vm = StateObject(wrappedValue: PayoutsViewModel(api: api)) }

    var body: some View {
        LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { items in
            if items.isEmpty {
                EmptyStateView(systemImage: "building.columns", title: lang.t("payouts.empty"), message: lang.t("payouts.empty_hint"))
            } else {
                List(items) { s in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(lang.digits("\(s.periodStart ?? "") → \(s.periodEnd ?? "")")).font(.subheadline)
                            Spacer()
                            StatusPill(text: lang.t("settlement.status.\(s.status)", fallback: s.status),
                                       color: s.status == "paid" ? Brand.success : Brand.info)
                        }
                        KeyValueRow(label: lang.t("payouts.net"), value: lang.money(s.netBaisa), bold: true,
                                    valueColor: s.netBaisa >= 0 ? Brand.success : Brand.danger)
                        KeyValueRow(label: lang.t("payouts.credits"), value: lang.money(s.creditsBaisa))
                        KeyValueRow(label: lang.t("payouts.debits"), value: lang.money(s.debitsBaisa))
                        if let ref = s.payoutReference {
                            Text(verbatim: ref).font(.caption.monospaced()).foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .refreshable { await vm.load() }
            }
        }
        .navigationTitle(lang.t("earnings.payouts"))
        .task { await vm.load() }
    }
}
