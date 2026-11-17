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

    var body: some View {
        NavigationStack(path: $router.ordersPath) {
            VStack(spacing: 0) {
                Picker("", selection: Binding(get: { vm.segment }, set: { s in Task { await vm.switchSegment(s) } })) {
                    Text(lang.t("orders.active")).tag(Endpoints.OrderListStatus.active)
                    Text(lang.t("orders.past")).tag(Endpoints.OrderListStatus.past)
                }
                .pickerStyle(.segmented)
                .padding()

                LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { orders in
                    if orders.isEmpty {
                        EmptyStateView(systemImage: "bag", title: lang.t(vm.segment == .active ? "orders.empty_active" : "orders.empty_past"))
                    } else {
                        List {
                            ForEach(orders) { o in
                                NavigationLink(value: OrderRoute(id: o.id)) { OrderRow(order: o) }
                                    .onAppear { if o.id == orders.last?.id { Task { await vm.loadMore() } } }
                            }
                            if vm.isLoadingMore { ProgressView().frame(maxWidth: .infinity) }
                        }
                        .listStyle(.plain)
                    }
                }
                .refreshable { await vm.load() }
            }
            .navigationTitle(lang.t("tab.orders"))
            .navigationDestination(for: OrderRoute.self) { route in
                destination(route)
            }
        }
        .task(id: router.ordersVersion) { await vm.load() }
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

struct OrderRow: View {
    @EnvironmentObject var lang: LanguageSettings
    let order: Order

    var body: some View {
        HStack(spacing: 12) {
            if order.type == .c2c {
                Image(systemName: "shippingbox.fill")
                    .frame(width: 44, height: 44)
                    .foregroundColor(Brand.primary)
                    .background(Brand.primaryLight, in: RoundedRectangle(cornerRadius: Brand.radiusMd))
                    .accessibilityHidden(true)
            } else {
                RemoteImage(urlString: order.merchant?.logoUrl, placeholderIcon: "storefront")
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: Brand.radiusMd))
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(order.merchant.map { lang.name($0) } ?? lang.t("orders.parcel")).font(.headline)
                Text(verbatim: order.number).font(.caption.monospaced()).foregroundColor(.secondary)
                Text(lang.dateTime(order.createdAt)).font(.caption2).foregroundColor(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                StatusPill(text: lang.t("order.status.\(order.status.rawValue)"), color: order.status.color)
                Text(lang.money(order.totalBaisa)).font(.subheadline.bold())
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
