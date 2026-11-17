import SwiftUI
import UIKit
import UserNotifications
import QabnahKit

/// APNs registration. Registration failures (simulator, missing entitlement, unsigned build, no
/// network) are logged and otherwise ignored — push is a nice-to-have on top of realtime + polling.
///
/// * Authorization is requested right after sign-in (`SessionStore.didSignIn`), never at launch.
/// * On launch / foreground while signed in, re-registers silently if already authorized
///   (APNs tokens can rotate) and uploads the token with `POST /me/devices`.
/// * On sign-out, `POST /me/devices/unregister` while the session is still valid.
@MainActor
final class PushRegistrar {
    static let shared = PushRegistrar()
    private static let tokenKey = "qabnah.push.token"

    private var api: APIClient?
    private var app: ClientApp = .consumer
    /// Last APNs token of this device (persisted so sign-out after a relaunch can unregister it).
    private(set) var lastToken: String? = UserDefaults.standard.string(forKey: PushRegistrar.tokenKey)
    /// Token already sent with `POST /me/devices` for the current session.
    private var uploadedToken: String?

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

    /// No prompt: only re-registers when the user already allowed notifications.
    func refreshRegistrationIfAuthorized() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let status = settings.authorizationStatus
            guard status == .authorized || status == .provisional || status == .ephemeral else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    func didRegister(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        if token != lastToken {
            lastToken = token
            UserDefaults.standard.set(token, forKey: Self.tokenKey)
        }
        upload(token)
    }

    func didFailToRegister(_ error: Error) {
        print("[push] APNs registration failed (ignored): \(error.localizedDescription)")
    }

    /// Best effort `POST /me/devices/unregister`; call while still signed in.
    func unregisterFromServer() async {
        defer { uploadedToken = nil }
        guard let api, api.isSignedIn, let token = lastToken else { return }
        do {
            _ = try await api.send(Endpoints.unregisterDevice(token: token))
        } catch {
            print("[push] POST /me/devices/unregister failed (ignored): \(error.localizedDescription)")
        }
    }

    /// The session is gone server-side (account deleted); nothing to unregister.
    func forgetToken() {
        uploadedToken = nil
    }

    private func upload(_ token: String) {
        guard let api, api.isSignedIn, uploadedToken != token else { return }
        let app = self.app
        uploadedToken = token
        Task { @MainActor in
            do {
                _ = try await api.send(Endpoints.registerDevice(DeviceRegistrationInput(app: app, token: token)))
            } catch {
                if self.uploadedToken == token { self.uploadedToken = nil } // retry on next foreground
                print("[push] POST /me/devices failed (ignored): \(error.localizedDescription)")
            }
        }
    }
}

/// Hand-off from the notification delegate to the SwiftUI apps: the payload of a tapped
/// notification waits here until the app's root view routes it (also covers a cold launch
/// from a notification, where the tap arrives before the UI exists).
@MainActor
final class NotificationRouter: ObservableObject {
    static let shared = NotificationRouter()
    @Published var tapped: PushPayload?
}

/// `UNUserNotificationCenterDelegate`: banners while in the foreground, routing on tap.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound, .badge])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let payload = PushPayload(userInfo: response.notification.request.content.userInfo)
        let isTap = response.actionIdentifier == UNNotificationDefaultActionIdentifier
        completionHandler()
        guard isTap else { return }
        Task { @MainActor in NotificationRouter.shared.tapped = payload }
    }
}

/// Shared UIApplicationDelegate for APNs callbacks.
final class QabnahAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Must be set before launch finishes to receive the tap that launched the app.
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in PushRegistrar.shared.didRegister(deviceToken: deviceToken) }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in PushRegistrar.shared.didFailToRegister(error) }
    }
}
