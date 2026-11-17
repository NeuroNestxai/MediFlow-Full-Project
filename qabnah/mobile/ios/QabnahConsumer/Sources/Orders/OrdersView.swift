import SwiftUI
import QabnahKit

@MainActor
final class OrdersViewModel: ObservableObject {
    @Published var segment: Endpoints.OrderListStatus = .active
    @Published private(set) var state: Loadable<[Order]> = .idle
    @Published private(set) var hasMore = false
    @Published private(set) var isLoadingMore = false
    private let api: APIClient
    private let pageSize = 20

    init(api: APIClient) { self.api = api }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            let page = try await api.send(Endpoints.orders(status: segment, limit: pageSize, offset: 0))
            state = .loaded(page.items)
            hasMore = page.hasMore
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
            let page = try await api.send(Endpoints.orders(status: segment, limit: pageSize, offset: current.count))
            let known = Set(current.map(\.id))
            state = .loaded(current + page.items.filter { !known.contains($0.id) })
            hasMore = page.hasMore
        } catch {
            hasMore = false
        }
    }

    func switchSegment(_ s: Endpoints.OrderListStatus) async {
        segment = s
        state = .loading
        await load()
    }
}

struct OrdersView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var router: ConsumerRouter
    @EnvironmentObject var session: SessionStore
    @StateObject private var vm: OrdersViewModel
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
        _vm = StateObject(wrappedValue: OrdersViewModel(api: api))
    }

    private var segment: Binding<Endpoints.OrderListStatus> {
        Binding(get: { vm.segment }, set: { s in Task { await vm.switchSegment(s) } })
    }

    var body: some View {
        NavigationStack(path: $router.ordersPath) {
            VStack(spacing: 0) {
                Picker(lang.t("tab.orders"), selection: segment) {
                    Text(lang.t("orders.active")).tag(Endpoints.OrderListStatus.active)
                    Text(lang.t("orders.past")).tag(Endpoints.OrderListStatus.past)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .padding(.horizontal, QTheme.space4)
                .padding(.vertical, QTheme.space3)

                LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { orders in
                    if orders.isEmpty {
                        EmptyStateView(systemImage: "bag",
                                       title: lang.t(vm.segment == .active ? "orders.empty_active" : "orders.empty_past"),
                                       actionTitle: lang.t("orders.browse_stores"), action: { router.tab = .home })
                    } else {
                        list(orders)
                    }
                }
            }
            .qScreen()
            .navigationTitle(lang.t("tab.orders"))
            .navigationDestination(for: OrderRoute.self) { route in
                destination(route)
            }
        }
        .task(id: router.ordersVersion) { await vm.load() }
    }

    private func list(_ orders: [Order]) -> some View {
        ScrollView {
            LazyVStack(spacing: QTheme.space3) {
                ForEach(orders) { o in
                    NavigationLink(value: OrderRoute(id: o.id)) { OrderRow(order: o) }
                        .buttonStyle(.plain)
                        .onAppear { if o.id == orders.last?.id { Task { await vm.loadMore() } } }
                }
                if vm.isLoadingMore { QSkeletonRow().padding(.horizontal, QTheme.space4) }
            }
            .padding(QTheme.space4)
        }
        .refreshable { await vm.load() }
    }

    @ViewBuilder
    private func destination(_ route: OrderRoute) -> some View {
        switch route.screen {
        case .detail:
            OrderDetailView(api: api, realtime: session.realtime, orderId: route.id)
        case .tracking:
            TrackingView(api: api, realtime: session.realtime, orderId: route.id)
        }
    }
}

/// Order card: store logo (or a parcel tile), store name, number and date, status pill and total.
struct OrderRow: View {
    @EnvironmentObject var lang: LanguageSettings
    let order: Order

    var body: some View {
        HStack(alignment: .top, spacing: QTheme.space3) {
            leading
            VStack(alignment: .leading, spacing: 4) {
                Text(order.merchant.map { lang.name($0) } ?? lang.t("orders.parcel"))
                    .qFont(.h3)
                    .foregroundColor(QTheme.ink)
                    .lineLimit(1)
                Text(verbatim: order.number).qFont(.small, tabular: true).foregroundColor(QTheme.muted)
                Text(lang.dateTime(order.createdAt)).qFont(.micro).foregroundColor(QTheme.muted)
            }
            Spacer(minLength: QTheme.space2)
            VStack(alignment: .trailing, spacing: 6) {
                StatusPill(text: lang.t("order.status.\(order.status.rawValue)"), color: order.status.color)
                QPrice(baisa: order.totalBaisa)
            }
        }
        .card()
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var leading: some View {
        if let m = order.merchant, order.type != .c2c {
            QLogoChip(urlString: m.logoUrl, name: lang.name(m), size: 48)
        } else {
            Image(systemName: "shippingbox.fill")
                .font(.system(size: 20))
                .foregroundColor(QTheme.primary)
                .frame(width: 48, height: 48)
                .background(QTheme.primarySoft)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityHidden(true)
        }
    }
}
