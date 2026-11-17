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
        PushRegistrar.shared.refreshRegistrationIfAuthorized()
        Task {
            await realtime.start()
            if me == nil { await loadMe() }
        }
    }

    func signOut() async {
        onSignOut.values.forEach { $0() }
        await realtime.reset()
        // Needs the session, so before /auth/logout.
        await PushRegistrar.shared.unregisterFromServer()
        await api.signOut()
        me = nil
        isSignedIn = false
    }

    /// After `POST /me/delete` succeeded: the server already revoked every session and token.
    func accountDeleted() async {
        onSignOut.values.forEach { $0() }
        await realtime.reset()
        PushRegistrar.shared.forgetToken()
        api.clearSession()
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

