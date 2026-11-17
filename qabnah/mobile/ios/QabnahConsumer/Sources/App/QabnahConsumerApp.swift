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

    init() {
        // Bars are styled before the first window exists.
        QAppearance.apply(language: LanguageSettings.storedLanguage, showsTabSelectionDot: true)
    }

    var body: some Scene {
        WindowGroup {
            ConsumerRootView()
                .environmentObject(lang)
                .environmentObject(session)
                .environmentObject(cart)
                .environmentObject(router)
                .qabnahLocalized(lang)
                .tint(QTheme.primary)
                .preferredColorScheme(.light)
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
                .onOpenURL { url in
                    PaymentReturn.handle(url)
                    if let route = DeepLink.route(from: url, app: .consumer) {
                        router.open(route, signedIn: session.isSignedIn)
                    }
                }
                .onReceive(NotificationRouter.shared.$tapped) { payload in
                    guard let payload else { return }
                    NotificationRouter.shared.tapped = nil
                    if let route = payload.route(for: .consumer) {
                        router.open(route, signedIn: session.isSignedIn)
                    }
                }
        }
    }
}

/// Guests can browse Home and storefronts (`/stores`, `/stores/{slug}` and `/zones` are public).
/// Checkout, Send, Orders and Account ask for OTP sign-in in a sheet and then carry on.
struct ConsumerRootView: View {
    var body: some View {
        ConsumerTabView()
    }
}

struct ConsumerTabView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var router: ConsumerRouter

    private var selection: Binding<ConsumerRouter.Tab> {
        Binding(get: { router.tab }, set: { router.select($0, signedIn: session.isSignedIn) })
    }

    var body: some View {
        TabView(selection: selection) {
            HomeView(api: session.api)
                .tabItem { Label(lang.t("tab.home"), systemImage: "house").accessibilityIdentifier("tab.home") }
                .tag(ConsumerRouter.Tab.home)
            gated(.send) { SendView(api: session.api) }
                .tabItem { Label(lang.t("tab.send"), systemImage: "shippingbox").accessibilityIdentifier("tab.send") }
                .tag(ConsumerRouter.Tab.send)
            gated(.orders) { OrdersView(api: session.api) }
                .tabItem { Label(lang.t("tab.orders"), systemImage: "list.bullet.rectangle").accessibilityIdentifier("tab.orders") }
                .tag(ConsumerRouter.Tab.orders)
            gated(.account) { AccountView() }
                .tabItem { Label(lang.t("tab.account"), systemImage: "person.crop.circle").accessibilityIdentifier("tab.account") }
                .tag(ConsumerRouter.Tab.account)
        }
        .signInSheet(isPresented: $router.signInPrompt, subtitleKey: "auth.subtitle_consumer") {
            router.signedIn()
        }
    }

    /// The tab's screen once signed in; a sign-in prompt for guests (normally not reached,
    /// because selecting the tab already asks for sign-in).
    @ViewBuilder
    private func gated<Content: View>(_ tab: ConsumerRouter.Tab, @ViewBuilder content: () -> Content) -> some View {
        if session.isSignedIn {
            content()
        } else {
            SignInRequiredView { router.requestSignIn(then: tab) }
        }
    }
}

struct SignInRequiredView: View {
    @EnvironmentObject var lang: LanguageSettings
    let signIn: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            EmptyStateView(systemImage: "person.crop.circle.badge.questionmark", title: lang.t("guest.sign_in_title"),
                           message: lang.t("guest.sign_in_message"))
                .frame(maxHeight: 280)
            Button(lang.t("guest.sign_in"), action: signIn)
                .buttonStyle(PrimaryButtonStyle())
                .accessibilityIdentifier("guest.signIn")
                .frame(maxWidth: 280)
        }
        .padding()
    }
}

struct OrderRoute: Hashable {
    enum Screen: Hashable { case detail, tracking }
    let id: String
    var screen: Screen = .detail
}

enum AccountRoute: Hashable {
    case ticket(String)
}

/// Cross-tab navigation (e.g. "order placed → open it in Orders"), push / deep-link routing,
/// and the guest sign-in gate.
@MainActor
final class ConsumerRouter: ObservableObject {
    enum Tab: Hashable {
        case home, send, orders, account
        var requiresSignIn: Bool { self != .home }
    }

    private enum AfterSignIn {
        case tab(Tab)
        case route(AppRoute)
    }

    @Published var tab: Tab = .home
    @Published var ordersPath: [OrderRoute] = []
    @Published var accountPath: [AccountRoute] = []
    /// Bumped when a new order is created so the Orders list reloads.
    @Published private(set) var ordersVersion = 0
    /// Presents the OTP sheet over the tabs.
    @Published var signInPrompt = false
    private var afterSignIn: AfterSignIn?

    func select(_ newTab: Tab, signedIn: Bool) {
        if newTab.requiresSignIn && !signedIn {
            requestSignIn(then: newTab)
        } else {
            tab = newTab
        }
    }

    func requestSignIn(then newTab: Tab) {
        afterSignIn = .tab(newTab)
        signInPrompt = true
    }

    /// Push tap, in-app notification or `qabnah://` link.
    func open(_ route: AppRoute, signedIn: Bool) {
        guard signedIn else {
            afterSignIn = .route(route)
            signInPrompt = true
            return
        }
        switch route {
        case .order(let id):
            showOrder(id)
        case .tracking(let id):
            ordersVersion += 1
            tab = .orders
            ordersPath = [OrderRoute(id: id), OrderRoute(id: id, screen: .tracking)]
        case .ticket(let id):
            tab = .account
            accountPath = [.ticket(id)]
        case .offer, .delivery, .documents, .captainHome:
            break // captain-only screens
        }
    }

    /// The sign-in sheet closed with a session: continue where the guest was going.
    func signedIn() {
        guard let next = afterSignIn else { return }
        afterSignIn = nil
        switch next {
        case .tab(let t): tab = t
        case .route(let r): open(r, signedIn: true)
        }
    }

    func showOrder(_ id: String) {
        ordersVersion += 1
        tab = .orders
        ordersPath = [OrderRoute(id: id)]
    }

    func reset() {
        tab = .home
        ordersPath = []
        accountPath = []
        afterSignIn = nil
        signInPrompt = false
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
