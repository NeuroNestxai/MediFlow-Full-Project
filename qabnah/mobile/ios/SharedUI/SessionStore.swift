import SwiftUI
import QabnahKit
import UserNotifications
import UIKit

/// Owns the API + realtime clients and the signed-in state for one app.
@MainActor
final class SessionStore: ObservableObject {
    let api: APIClient
    let realtime: RealtimeClient
    let app: ClientApp

    @Published private(set) var isSignedIn: Bool
    @Published var me: Me?
    @Published var meError: Error?
    @Published private(set) var isLoadingMe = false

    /// Hooks for app-specific cleanup on sign-out (cart, location tracking…).
    var onSignOut: [String: () -> Void] = [:]

    init(app: ClientApp, keychainService: String) {
        let config = AppConfig.fromBundle()
        let api = APIClient(config: config, tokenStore: TokenStores.platformDefault(service: keychainService))
        self.api = api
        self.app = app
        self.realtime = RealtimeClient(url: config.realtimeURL) { try await api.validAccessToken() }
        self.isSignedIn = api.isSignedIn
        api.onSessionExpired = { [weak self] in
            Task { @MainActor in self?.handleSessionExpired() }
        }
        PushRegistrar.shared.configure(api: api, app: app)
    }

    func setLanguage(_ language: AppLanguage) {
        api.language = language
        guard isSignedIn else { return }
        // Persist the preference so server-side notifications use it too.
        Task { _ = try? await api.send(Endpoints.updateMe(ProfileUpdateInput(locale: language.rawValue))) }
    }

    func didSignIn(_ result: AuthResult) {
        api.signIn(with: result)
        isSignedIn = true
        Task {
            await loadMe()
            await realtime.start()
            PushRegistrar.shared.requestAuthorizationAndRegister()
        }
    }

    func loadMe() async {
        guard isSignedIn else { return }
        isLoadingMe = true
        defer { isLoadingMe = false }
        do {
            me = try await api.send(Endpoints.me())
            meError = nil
        } catch {
            if (error as? APIError)?.isCancelled != true { meError = error }
        }
    }

    /// Called on launch / foreground.
    func resume() {
        guard isSignedIn else { return }
        Task {
            await realtime.start()
            if me == nil { await loadMe() }
        }
    }

    func signOut() async {
        onSignOut.values.forEach { $0() }
        await realtime.reset()
        await api.signOut()
        me = nil
        isSignedIn = false
    }

    private func handleSessionExpired() {
        guard isSignedIn else { return }
        onSignOut.values.forEach { $0() }
        Task { await realtime.reset() }
        me = nil
        isSignedIn = false
    }
}

/// APNs registration. Registration failures (simulator, missing entitlement, no network)
/// are logged and otherwise ignored — push is a nice-to-have on top of realtime + polling.
@MainActor
final class PushRegistrar {
    static let shared = PushRegistrar()
    private var api: APIClient?
    private var app: ClientApp = .consumer
    private var lastToken: String?

    func configure(api: APIClient, app: ClientApp) {
        self.api = api
        self.app = app
    }

    func requestAuthorizationAndRegister() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            if let error { print("[push] authorization error: \(error.localizedDescription)") }
            guard granted else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    func didRegister(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        lastToken = token
        upload(token)
    }

    func didFailToRegister(_ error: Error) {
        print("[push] APNs registration failed (ignored): \(error.localizedDescription)")
    }

    private func upload(_ token: String) {
        guard let api, api.isSignedIn else { return }
        let app = self.app
        Task {
            do {
                _ = try await api.send(Endpoints.registerDevice(DeviceRegistrationInput(app: app, token: token)))
            } catch {
                print("[push] POST /me/devices failed (ignored): \(error.localizedDescription)")
            }
        }
    }
}

/// Shared UIApplicationDelegate for APNs callbacks.
final class QabnahAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in PushRegistrar.shared.didRegister(deviceToken: deviceToken) }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in PushRegistrar.shared.didFailToRegister(error) }
    }
}
