import SwiftUI
import Charts
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
                    list(items)
                }
            }
            .qScreen()
            .navigationTitle(lang.t("tab.deliveries"))
            .task { await vm.load() }
        }
    }

    private func list(_ items: [CaptainDelivery]) -> some View {
        ScrollView {
            LazyVStack(spacing: QTheme.space3) {
                ForEach(items) { d in
                    HistoryRow(delivery: d)
                        .onAppear { if d.id == items.last?.id { Task { await vm.loadMore() } } }
                }
                if vm.isLoadingMore { QSkeletonRow() }
            }
            .padding(QTheme.space4)
        }
        .refreshable { await vm.load() }
    }
}

struct HistoryRow: View {
    @EnvironmentObject var lang: LanguageSettings
    let delivery: CaptainDelivery

    private var statusColor: Color {
        if delivery.status == .delivered { return QTheme.success }
        if delivery.status == .failed { return QTheme.danger }
        return QTheme.muted
    }

    var body: some View {
        HStack(alignment: .top, spacing: QTheme.space3) {
            VStack(alignment: .leading, spacing: 3) {
                Text(delivery.merchantName ?? lang.t("offer.parcel")).qFont(.h3).foregroundColor(QTheme.ink).lineLimit(1)
                if let n = delivery.orderNumber {
                    Text(verbatim: n).qFont(.small, tabular: true).foregroundColor(QTheme.muted)
                }
                if let at = delivery.deliveredAt ?? delivery.assignedAt {
                    Text(lang.dateTime(at)).qFont(.micro).foregroundColor(QTheme.muted)
                }
                if let reason = delivery.failureReason, delivery.status == .failed {
                    Text(reason).qFont(.small).foregroundColor(QTheme.danger)
                }
            }
            Spacer(minLength: QTheme.space2)
            VStack(alignment: .trailing, spacing: 6) {
                QPrice(baisa: delivery.earningBaisa)
                StatusPill(text: lang.t("delivery.status.\(delivery.status.rawValue)"), color: statusColor)
            }
        }
        .card()
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

/// Earnings: period selector, the earned figure, a bar chart of income per day, the balance with
/// the platform and the ledger activity.
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
            ScrollView {
                VStack(alignment: .leading, spacing: QTheme.space4) {
                    Picker(lang.t("earnings.period"), selection: $vm.preset) {
                        ForEach(DateRangePreset.allCases) { p in Text(lang.t("earnings.preset.\(p.rawValue)")).tag(p) }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { e in
                        content(e)
                    }
                }
                .padding(QTheme.space4)
            }
            .qScreen()
            .refreshable { await vm.load() }
            .navigationTitle(lang.t("tab.earnings"))
            .task(id: vm.preset) { await vm.load() }
        }
    }

    @ViewBuilder
    private func content(_ e: Earnings) -> some View {
        summary(e)
        EarningsChartCard(days: e.dailyEarnings())
        balanceCard(e)
        NavigationLink { PayoutsView(api: api) } label: {
            HStack {
                Label(lang.t("earnings.payouts"), systemImage: "building.columns").qFont(.h3).foregroundColor(QTheme.ink)
                Spacer()
                Image(systemName: "chevron.forward").font(.system(size: 13, weight: .semibold)).foregroundColor(QTheme.muted)
                    .accessibilityHidden(true)
            }
            .card()
        }
        .buttonStyle(.plain)
        if !e.entries.isEmpty { entriesCard(e) }
    }

    private func summary(_ e: Earnings) -> some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            Text(lang.t("earnings.earned")).qFont(.small, .medium).foregroundColor(QTheme.muted)
            QPrice(baisa: e.earningsBaisa, style: .h1)
            Rectangle().fill(QTheme.line).frame(height: 1)
            KeyValueRow(label: lang.t("earnings.deliveries"), value: lang.digits("\(e.deliveriesCount)"))
            KeyValueRow(label: lang.t("earnings.cod_collected"), value: lang.money(e.codCollectedBaisa))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private func balanceCard(_ e: Earnings) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(lang.t("earnings.balance")).qFont(.small, .medium).foregroundColor(QTheme.muted)
            balance(e)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    @ViewBuilder
    private func balance(_ e: Earnings) -> some View {
        switch e.balanceDirection {
        case .platformOwesCaptain(let amount):
            Text(lang.f("earnings.we_owe_you", lang.money(amount))).qFont(.h3).foregroundColor(QTheme.success)
            Text(lang.t("earnings.we_owe_you_hint")).qFont(.small).foregroundColor(QTheme.muted)
        case .captainOwesPlatform(let amount):
            Text(lang.f("earnings.you_owe", lang.money(amount))).qFont(.h3).foregroundColor(QTheme.danger)
            Text(lang.t("earnings.you_owe_hint")).qFont(.small).foregroundColor(QTheme.muted)
        case .settled:
            Text(lang.t("earnings.settled")).qFont(.h3).foregroundColor(QTheme.ink)
        }
    }

    private func entriesCard(_ e: Earnings) -> some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            Text(lang.t("earnings.entries")).qFont(.h3).foregroundColor(QTheme.ink)
            ForEach(e.entries) { entry in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(lang.t("ledger.\(entry.entryType)", fallback: entry.entryType)).qFont(.body).foregroundColor(QTheme.ink)
                        if let number = entry.orderNumber {
                            Text(verbatim: number).qFont(.small, tabular: true).foregroundColor(QTheme.muted)
                        }
                        if let at = entry.createdAt {
                            Text(lang.dateTime(at)).qFont(.micro).foregroundColor(QTheme.muted)
                        }
                    }
                    Spacer(minLength: QTheme.space2)
                    Text(lang.money(entry.amountBaisa))
                        .qFont(.body, .semibold, tabular: true)
                        .foregroundColor(entry.amountBaisa >= 0 ? QTheme.success : QTheme.danger)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}

/// Bar chart of income per day (Swift Charts). Hidden when the period is a single day.
private struct EarningsChartCard: View {
    @EnvironmentObject var lang: LanguageSettings
    let days: [Earnings.DayTotal]

    private struct Bar: Identifiable {
        let id: String
        let date: Date
        let rials: Double
    }

    private var bars: [Bar] {
        var out: [Bar] = []
        for day in days {
            guard let date = MuscatCalendar.date(fromDay: day.day) else { continue }
            out.append(Bar(id: day.day, date: date, rials: Double(day.baisa) / 1000))
        }
        return out
    }

    var body: some View {
        if bars.count > 1 {
            VStack(alignment: .leading, spacing: QTheme.space3) {
                Text(lang.t("earnings.per_day")).qFont(.h3).foregroundColor(QTheme.ink)
                Chart(bars) { bar in
                    BarMark(x: .value(lang.t("earnings.period"), bar.date, unit: .day),
                            y: .value(lang.t("earnings.earned"), bar.rials))
                        .foregroundStyle(QTheme.saffron)
                        .cornerRadius(3)
                }
                .frame(height: 180)
                .accessibilityLabel(lang.t("earnings.per_day"))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
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
                            Text(lang.digits("\(s.periodStart ?? "") → \(s.periodEnd ?? "")")).qFont(.body)
                            Spacer()
                            StatusPill(text: lang.t("settlement.status.\(s.status)", fallback: s.status),
                                       color: s.status == "paid" ? QTheme.success : QTheme.info)
                        }
                        KeyValueRow(label: lang.t("payouts.net"), value: lang.money(s.netBaisa), bold: true,
                                    valueColor: s.netBaisa >= 0 ? QTheme.success : QTheme.danger)
                        KeyValueRow(label: lang.t("payouts.credits"), value: lang.money(s.creditsBaisa))
                        KeyValueRow(label: lang.t("payouts.debits"), value: lang.money(s.debitsBaisa))
                        if let ref = s.payoutReference {
                            Text(verbatim: ref).qFont(.small, tabular: true).foregroundColor(QTheme.muted)
                        }
                    }
                    .padding(.vertical, 4)
                    .listRowBackground(QTheme.surface)
                }
                .refreshable { await vm.load() }
            }
        }
        .qScreen()
        .navigationTitle(lang.t("earnings.payouts"))
        .task { await vm.load() }
    }
}
