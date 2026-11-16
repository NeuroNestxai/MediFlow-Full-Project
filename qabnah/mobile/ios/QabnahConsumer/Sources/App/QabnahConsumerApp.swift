import SwiftUI
import QabnahKit

@main
struct QabnahConsumerApp: App {
    @UIApplicationDelegateAdaptor(QabnahAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) var scenePhase

    @StateObject private var lang = LanguageSettings()
    @StateObject private var session = SessionStore(app: .consumer, keychainService: "om.qabnah.consumer.session")
    @StateObject private var cart = CartStore()
    @StateObject private var router = ConsumerRouter()

    var body: some Scene {
        WindowGroup {
            ConsumerRootView()
                .environmentObject(lang)
                .environmentObject(session)
                .environmentObject(cart)
                .environmentObject(router)
                .qabnahLocalized(lang)
                .tint(Brand.primary)
                .onAppear {
                    session.api.language = lang.language
                    lang.onChange = { [weak session] in session?.setLanguage($0) }
                    session.onSignOut["consumer"] = { [weak cart, weak router] in
                        cart?.clear()
                        router?.reset()
                    }
                    session.resume()
                }
                .onChange(of: scenePhase) { phase in
                    switch phase {
                    case .active: session.resume()
                    case .background: Task { await session.realtime.stop() }
                    default: break
                    }
                }
                .onOpenURL { url in PaymentReturn.handle(url) }
        }
    }
}

struct ConsumerRootView: View {
    @EnvironmentObject var session: SessionStore

    var body: some View {
        if session.isSignedIn {
            ConsumerTabView()
        } else {
            AuthFlowView(api: session.api, subtitleKey: "auth.subtitle_consumer")
        }
    }
}

struct ConsumerTabView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var router: ConsumerRouter

    var body: some View {
        TabView(selection: $router.tab) {
            HomeView(api: session.api)
                .tabItem { Label(lang.t("tab.home"), systemImage: "house") }
                .tag(ConsumerRouter.Tab.home)
            SendView(api: session.api)
                .tabItem { Label(lang.t("tab.send"), systemImage: "shippingbox") }
                .tag(ConsumerRouter.Tab.send)
            OrdersView(api: session.api)
                .tabItem { Label(lang.t("tab.orders"), systemImage: "list.bullet.rectangle") }
                .tag(ConsumerRouter.Tab.orders)
            AccountView()
                .tabItem { Label(lang.t("tab.account"), systemImage: "person.crop.circle") }
                .tag(ConsumerRouter.Tab.account)
        }
    }
}

struct OrderRoute: Hashable {
    let id: String
}

/// Cross-tab navigation (e.g. "order placed → open it in Orders").
@MainActor
final class ConsumerRouter: ObservableObject {
    enum Tab: Hashable { case home, send, orders, account }

    @Published var tab: Tab = .home
    @Published var ordersPath: [OrderRoute] = []
    /// Bumped when a new order is created so the Orders list reloads.
    @Published private(set) var ordersVersion = 0

    func showOrder(_ id: String) {
        ordersVersion += 1
        tab = .orders
        ordersPath = [OrderRoute(id: id)]
    }

    func reset() {
        tab = .home
        ordersPath = []
    }
}

/// Persistent single-merchant cart.
@MainActor
final class CartStore: ObservableObject {
    private static let storageKey = "qabnah.cart.v1"

    @Published private(set) var cart: Cart {
        didSet { persist() }
    }

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.storageKey),
           let saved = try? JSONDecoder().decode(Cart.self, from: data) {
            cart = saved
        } else {
            cart = Cart()
        }
    }

    func wouldConflict(with merchantId: String) -> Bool { cart.wouldConflict(with: merchantId) }

    @discardableResult
    func add(_ selection: ProductSelection, quantity: Int, notes: String?, merchant: CartMerchant,
             replacing: Bool = false) -> Cart.AddResult {
        cart.add(selection, quantity: quantity, notes: notes, merchant: merchant, replacingOtherMerchant: replacing)
    }

    func setQuantity(_ q: Int, line: String) { cart.setQuantity(q, forLine: line) }

    func clear() { cart.clear() }

    private func persist() {
        if let data = try? JSONEncoder().encode(cart) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }
}
