import SwiftUI
import QabnahKit

@main
struct QabnahCaptainApp: App {
    @UIApplicationDelegateAdaptor(QabnahAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) var scenePhase

    @StateObject private var lang = LanguageSettings()
    @StateObject private var session: SessionStore
    @StateObject private var store: CaptainStore
    @StateObject private var router = CaptainRouter()

    init() {
        let session = SessionStore(app: .captain, keychainService: "om.qabnah.captain.session")
        _session = StateObject(wrappedValue: session)
        _store = StateObject(wrappedValue: CaptainStore(api: session.api, realtime: session.realtime))
    }

    var body: some Scene {
        WindowGroup {
            CaptainRootView()
                .environmentObject(lang)
                .environmentObject(session)
                .environmentObject(store)
                .environmentObject(router)
                .qabnahLocalized(lang)
                .tint(Brand.primary)
                .onAppear {
                    session.api.language = lang.language
                    lang.onChange = { [weak session] in session?.setLanguage($0) }
                    session.onSignOut["captain"] = { [weak store, weak router] in
                        store?.reset()
                        router?.reset()
                    }
                    session.resume()
                }
                // Routes wait in the router until the signed-in tabs are on screen.
                .onOpenURL { url in
                    if let route = DeepLink.route(from: url, app: .captain) { router.pendingRoute = route }
                }
                .onReceive(NotificationRouter.shared.$tapped) { payload in
                    guard let payload else { return }
                    NotificationRouter.shared.tapped = nil
                    if let route = payload.route(for: .captain) { router.pendingRoute = route }
                }
                .onChange(of: scenePhase) { phase in
                    switch phase {
                    case .active:
                        session.resume()
                        if session.isSignedIn { Task { await store.refreshProfile(); await store.refreshActive() } }
                    case .background:
                        // Keep the socket while online (location streaming); otherwise save battery.
                        if !store.isOnline { Task { await session.realtime.stop() } }
                    default:
                        break
                    }
                }
        }
    }
}

struct CaptainRootView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var store: CaptainStore

    var body: some View {
        Group {
            if !session.isSignedIn {
                AuthFlowView(api: session.api, subtitleKey: "auth.subtitle_captain")
            } else if let me = session.me {
                if me.captain == nil && store.profile == nil {
                    NavigationStack { RegistrationView(api: session.api) }
                } else {
                    CaptainTabView()
                }
            } else if let error = session.meError {
                ErrorStateView(error: error) { Task { await session.loadMe() } }
            } else {
                LoadingView().task { await session.loadMe() }
            }
        }
        .onChange(of: session.me?.captain?.id) { _ in
            if let p = session.me?.captain, store.profile == nil { store.setProfile(p) }
        }
    }
}

struct CaptainTabView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var store: CaptainStore
    @EnvironmentObject var router: CaptainRouter

    var body: some View {
        TabView(selection: $router.tab) {
            CaptainHomeView()
                .tabItem { Label(lang.t("tab.home"), systemImage: "house") }
                .tag(CaptainRouter.Tab.home)
            DeliveriesHistoryView(api: session.api)
                .tabItem { Label(lang.t("tab.deliveries"), systemImage: "shippingbox") }
                .tag(CaptainRouter.Tab.deliveries)
            EarningsView(api: session.api)
                .tabItem { Label(lang.t("tab.earnings"), systemImage: "banknote") }
                .tag(CaptainRouter.Tab.earnings)
            CaptainProfileView()
                .tabItem { Label(lang.t("tab.profile"), systemImage: "person.crop.circle") }
                .tag(CaptainRouter.Tab.profile)
        }
        .fullScreenCover(item: $store.presentedOffer) { offer in
            OfferCardView(offer: offer)
                .environmentObject(lang)
                .environmentObject(store)
                .environmentObject(router)
                .qabnahLocalized(lang)
        }
        .task {
            if let p = session.me?.captain, store.profile == nil { store.setProfile(p) }
            await store.refreshProfile()
            await store.refreshActive()
        }
        .onReceive(router.$pendingRoute) { route in
            guard let route else { return }
            router.pendingRoute = nil
            router.apply(route, store: store)
        }
    }
}

/// Screens pushed on the Home tab's stack.
enum CaptainRoute: Hashable {
    case delivery(CaptainDelivery)
    case deliveryId(String)
    case ticket(String)
    case documents
}

/// Tab + Home navigation state, so an accepted offer, a push tap or a `qabnah://` link can open
/// the right screen.
@MainActor
final class CaptainRouter: ObservableObject {
    enum Tab: Hashable { case home, deliveries, earnings, profile }

    @Published var tab: Tab = .home
    @Published var homePath: [CaptainRoute] = []
    /// Set by push taps / deep links; applied by `CaptainTabView` once signed in.
    @Published var pendingRoute: AppRoute?

    /// Straight into the active-delivery screen (after accepting an offer).
    func showDelivery(_ delivery: CaptainDelivery) {
        tab = .home
        homePath = [.delivery(delivery)]
    }

    func apply(_ route: AppRoute, store: CaptainStore) {
        switch route {
        case .offer(let id):
            tab = .home
            Task { await store.openOffer(id: id) }
        case .delivery(let id):
            tab = .home
            if let d = store.activeDeliveries.first(where: { $0.id == id }) {
                homePath = [.delivery(d)]
            } else {
                homePath = [.deliveryId(id)]
            }
        case .ticket(let id):
            tab = .home
            homePath = [.ticket(id)]
        case .documents:
            tab = .home
            homePath = [.documents]
        case .captainHome:
            tab = .home
            homePath = []
        case .order, .tracking:
            break // consumer-only screens
        }
    }

    func reset() {
        tab = .home
        homePath = []
        pendingRoute = nil
    }
}
