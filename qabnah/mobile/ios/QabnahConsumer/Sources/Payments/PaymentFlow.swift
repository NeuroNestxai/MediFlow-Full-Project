import SwiftUI
import SafariServices
import Combine
import QabnahKit

/// Custom-scheme return from the hosted payment page: `qabnah://payment-return?orderId=…`.
enum PaymentReturn {
    static let notification = Notification.Name("QabnahPaymentReturn")
    static let scheme = "qabnah"

    static func returnURL(orderId: String) -> String {
        "\(scheme)://payment-return?orderId=\(orderId)"
    }

    static func handle(_ url: URL) {
        guard url.scheme == scheme, url.host == "payment-return" else { return }
        let orderId = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "orderId" })?.value
        NotificationCenter.default.post(name: notification, object: orderId)
    }
}

struct IdentifiableURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// Online payment: `POST /orders/{id}/checkout` → `SFSafariViewController` → on dismiss poll
/// `GET /orders/{id}` until `paymentStatus` changes. Payment success is decided server-side.
@MainActor
final class PaymentFlow: ObservableObject {
    enum Outcome: Equatable { case paid, failed, pending }

    @Published var page: IdentifiableURL?
    @Published private(set) var isStarting = false
    @Published private(set) var isPolling = false
    @Published private(set) var outcome: Outcome?
    @Published var error: Error?

    private let api: APIClient
    private var orderId: String?
    private var initialPaymentStatus: String?
    private var returnSubscription: AnyCancellable?

    init(api: APIClient) {
        self.api = api
        // Hosted page redirected to qabnah://payment-return → close Safari (onDismiss polls).
        returnSubscription = NotificationCenter.default.publisher(for: PaymentReturn.notification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] note in
                let id = note.object as? String
                Task { @MainActor in
                    guard let self, id == nil || id == self.orderId else { return }
                    self.page = nil
                }
            }
    }

    func start(order: Order) async {
        orderId = order.id
        initialPaymentStatus = order.paymentStatus
        outcome = nil
        isStarting = true
        defer { isStarting = false }
        do {
            let checkout = try await api.send(Endpoints.checkout(orderId: order.id,
                                                                 returnUrl: PaymentReturn.returnURL(orderId: order.id)))
            guard let url = api.config.resolve(checkout.checkoutUrl) else {
                throw APIError.invalidRequest("Invalid checkoutUrl")
            }
            error = nil
            page = IdentifiableURL(url: url)
        } catch {
            self.error = error
        }
    }

    /// Polls for up to ~60 s (2 s interval). Returns the refreshed order.
    @discardableResult
    func pageDismissed() async -> Order? {
        guard let id = orderId else { return nil }
        isPolling = true
        defer { isPolling = false }
        var latest: Order?
        for attempt in 0..<30 {
            do {
                let o = try await api.send(Endpoints.order(id: id))
                latest = o
                let changed = o.paymentStatus != initialPaymentStatus || o.status != .pendingPayment
                if changed {
                    outcome = Self.classify(o)
                    return o
                }
            } catch {
                if (error as? APIError)?.isCancelled == true { return latest }
                self.error = error
            }
            if attempt < 29 { try? await Task.sleep(nanoseconds: 2_000_000_000) }
        }
        outcome = .pending
        return latest
    }

    static func classify(_ o: Order) -> Outcome {
        let s = o.paymentStatus.lowercased()
        if ["paid", "captured", "succeeded", "authorized"].contains(s) || (o.status != .pendingPayment && o.status != .cancelled) {
            return .paid
        }
        if ["failed", "cancelled", "canceled", "expired", "declined"].contains(s) || o.status == .cancelled { return .failed }
        return .pending
    }
}

struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let vc = SFSafariViewController(url: url)
        vc.preferredControlTintColor = UIColor(Brand.primary)
        vc.dismissButtonStyle = .close
        return vc
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}

extension View {
    /// Presents the payment page for a `PaymentFlow` and polls when it closes.
    @MainActor
    func paymentSheet(_ flow: PaymentFlow, onFinished: @escaping (Order?) -> Void) -> some View {
        fullScreenCover(item: Binding(get: { flow.page }, set: { flow.page = $0 }),
                        onDismiss: { Task { onFinished(await flow.pageDismissed()) } }) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
    }
}

/// Overlay shown while confirming the payment with the server.
struct PaymentPollingOverlay: View {
    @EnvironmentObject var lang: LanguageSettings
    @ObservedObject var flow: PaymentFlow

    var body: some View {
        if flow.isPolling || flow.isStarting {
            ZStack {
                Color.black.opacity(0.25).ignoresSafeArea()
                VStack(spacing: 12) {
                    ProgressView()
                    Text(lang.t(flow.isPolling ? "payment.confirming" : "payment.starting"))
                }
                .padding(24)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: Brand.radiusLg))
            }
        }
    }
}
