import SwiftUI
import QabnahKit

@main
struct QabnahCaptainApp: App {
    @UIApplicationDelegateAdaptor(QabnahAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) var scenePhase

    @StateObject private var lang = LanguageSettings()
    @StateObject private var session: SessionStore
    @StateObject private var store: CaptainStore

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
                .qabnahLocalized(lang)
                .tint(Brand.primary)
                .onAppear {
                    session.api.language = lang.language
                    lang.onChange = { [weak session] in session?.setLanguage($0) }
                    session.onSignOut["captain"] = { [weak store] in store?.reset() }
                    session.resume()
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

    var body: some View {
        TabView {
            CaptainHomeView()
                .tabItem { Label(lang.t("tab.home"), systemImage: "house") }
            DeliveriesHistoryView(api: session.api)
                .tabItem { Label(lang.t("tab.deliveries"), systemImage: "shippingbox") }
            EarningsView(api: session.api)
                .tabItem { Label(lang.t("tab.earnings"), systemImage: "banknote") }
            CaptainProfileView()
                .tabItem { Label(lang.t("tab.profile"), systemImage: "person.crop.circle") }
        }
        .fullScreenCover(item: $store.presentedOffer) { offer in
            OfferCardView(offer: offer)
                .environmentObject(lang)
                .environmentObject(store)
                .qabnahLocalized(lang)
        }
        .task {
            if let p = session.me?.captain, store.profile == nil { store.setProfile(p) }
            await store.refreshProfile()
            await store.refreshActive()
        }
    }
}
