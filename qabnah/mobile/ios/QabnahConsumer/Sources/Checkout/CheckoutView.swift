import SwiftUI
import QabnahKit

@MainActor
final class CheckoutViewModel: ObservableObject {
    @Published private(set) var addresses: Loadable<[Address]> = .idle
    @Published var selectedAddressId: String? { didSet { if oldValue != selectedAddressId { scheduleQuote() } } }
    @Published var paymentMethod: PaymentMethod = .cod { didSet { if oldValue != paymentMethod { scheduleQuote() } } }
    @Published var notes = ""
    @Published private(set) var quote: PriceBreakdown?
    @Published private(set) var quoteError: Error?
    @Published private(set) var isQuoting = false
    @Published private(set) var isPlacing = false
    @Published var placeError: Error?

    private let api: APIClient
    private let cartStore: CartStore
    private var quoteTask: Task<Void, Never>?
    // Same request body ⇒ same Idempotency-Key, so a retry after a timeout can't double-order.
    private var idempotency: (fingerprint: String, key: String)?

    init(api: APIClient, cart: CartStore) {
        self.api = api
        self.cartStore = cart
        self.paymentMethod = cart.cart.allowedPaymentMethods.first ?? .cod
    }

    var allowedPaymentMethods: [PaymentMethod] { cartStore.cart.allowedPaymentMethods }

    var selectedAddress: Address? {
        addresses.value?.first { $0.id == selectedAddressId }
    }

    var canPlace: Bool {
        selectedAddressId != nil && quote != nil && !isPlacing && !isQuoting
            && allowedPaymentMethods.contains(paymentMethod)
    }

    func loadAddresses() async {
        if addresses.value == nil { addresses = .loading }
        do {
            let items = try await api.send(Endpoints.addresses()).items
            addresses = .loaded(items)
            if selectedAddressId == nil || !items.contains(where: { $0.id == selectedAddressId }) {
                selectedAddressId = (items.first { $0.isDefault == true } ?? items.first)?.id
            }
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            addresses = .failed(error)
        }
    }

    func addressCreated(_ address: Address) {
        var list = addresses.value ?? []
        list.insert(address, at: 0)
        addresses = .loaded(list)
        selectedAddressId = address.id
    }

    private var input: MarketplaceOrderInput? {
        cartStore.cart.orderInput(addressId: selectedAddressId, paymentMethod: paymentMethod, notes: notes)
    }

    func scheduleQuote() {
        quoteTask?.cancel()
        quoteTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            await self?.requote()
        }
    }

    func requote() async {
        guard selectedAddressId != nil, let input else { quote = nil; return }
        isQuoting = true
        defer { isQuoting = false }
        do {
            quote = try await api.send(Endpoints.quoteOrder(input))
            quoteError = nil
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            quote = nil
            quoteError = error
        }
    }

    /// Called once the flow is over (not right after placing: clearing the cart would pop this
    /// screen, which lives inside the cart sheet, while the payment page is still open).
    func clearCart() { cartStore.clear() }

    func place() async -> Order? {
        guard let input else { return nil }
        let fingerprint = (try? String(decoding: JSONEncoder.qabnah.encode(input), as: UTF8.self)) ?? UUID().uuidString
        if idempotency?.fingerprint != fingerprint {
            idempotency = (fingerprint, UUID().uuidString)
        }
        isPlacing = true
        defer { isPlacing = false }
        do {
            let order = try await api.send(Endpoints.placeOrder(input, idempotencyKey: idempotency!.key))
            placeError = nil
            return order
        } catch {
            placeError = error
            return nil
        }
    }
}

/// Checkout in three steps — address, payment, review — with a night bar that carries the total
/// and the single primary action of the current step.
struct CheckoutView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var router: ConsumerRouter
    @StateObject private var vm: CheckoutViewModel
    @StateObject private var payment: PaymentFlow
    @State private var showNewAddress = false
    @State private var placedOrder: Order? = nil
    @State private var step = 0
    private let api: APIClient
    let onClose: () -> Void

    init(api: APIClient, cart: CartStore, onClose: @escaping () -> Void) {
        self.api = api
        self.onClose = onClose
        _vm = StateObject(wrappedValue: CheckoutViewModel(api: api, cart: cart))
        _payment = StateObject(wrappedValue: PaymentFlow(api: api))
    }

    private var stepTitles: [String] {
        [lang.t("checkout.deliver_to"), lang.t("checkout.payment"), lang.t("checkout.summary")]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: QTheme.space5) {
                QStepProgress(titles: stepTitles, current: step)
                stepContent
                InlineError(error: vm.placeError)
                InlineError(error: payment.error)
            }
            .padding(QTheme.space4)
        }
        .qScreen()
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { bottomBar }
        .overlay { PaymentPollingOverlay(flow: payment) }
        .paymentSheet(payment) { _ in finish() }
        .sheet(isPresented: $showNewAddress) {
            AddressEditorView(api: api, existing: nil) { vm.addressCreated($0) }
        }
        .navigationTitle(lang.t("checkout.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await vm.loadAddresses()
            await vm.requote()
        }
    }

    @ViewBuilder private var stepContent: some View {
        switch step {
        case 0: addressStep
        case 1: paymentStep
        default: reviewStep
        }
    }

    // MARK: Step 1 — address

    private var addressStep: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            QSectionTitle(text: lang.t("checkout.deliver_to"))
            switch vm.addresses {
            case .idle, .loading:
                LoadingView(rows: 2).frame(height: 160)
            case .failed(let e):
                ErrorStateView(error: e) { Task { await vm.loadAddresses() } }
            case .loaded(let list):
                ForEach(list) { a in
                    addressRow(a)
                }
            }
            Button { showNewAddress = true } label: {
                Label(lang.t("checkout.drop_pin"), systemImage: "mappin.and.ellipse")
            }
            .buttonStyle(SecondaryButtonStyle())
        }
    }

    private func addressRow(_ a: Address) -> some View {
        let selected = vm.selectedAddressId == a.id
        return Button { vm.selectedAddressId = a.id } label: {
            QChoiceRow(selected: selected) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(a.label ?? lang.t("address.unnamed")).qFont(.h3).foregroundColor(QTheme.ink)
                    if !a.summary.isEmpty {
                        Text(a.summary).qFont(.small).foregroundColor(QTheme.muted)
                    }
                    if !a.isInServiceArea {
                        Text(lang.t("address.out_of_area")).qFont(.small).foregroundColor(QTheme.danger)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: Step 2 — payment

    private var paymentStep: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            QSectionTitle(text: lang.t("checkout.payment"))
            if vm.allowedPaymentMethods.isEmpty {
                Text(lang.t("checkout.no_payment_methods")).qFont(.body).foregroundColor(QTheme.danger)
            } else {
                ForEach(vm.allowedPaymentMethods, id: \.self) { m in
                    paymentRow(m)
                }
            }
            Text(lang.t("checkout.notes")).qFont(.h3).foregroundColor(QTheme.ink).padding(.top, QTheme.space2)
            TextField(lang.t("checkout.notes_placeholder"), text: $vm.notes, axis: .vertical)
                .lineLimit(1...3)
                .padding(.vertical, QTheme.space2)
                .qField()
        }
    }

    private func paymentRow(_ method: PaymentMethod) -> some View {
        let selected = vm.paymentMethod == method
        return Button { vm.paymentMethod = method } label: {
            QChoiceRow(selected: selected) {
                Image(systemName: method == .online ? "creditcard" : "banknote")
                    .foregroundColor(QTheme.muted)
                    .accessibilityHidden(true)
                Text(lang.t("payment.\(method.rawValue)")).qFont(.body).foregroundColor(QTheme.ink)
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: Step 3 — review

    private var reviewStep: some View {
        VStack(alignment: .leading, spacing: QTheme.space4) {
            QSectionTitle(text: lang.t("checkout.summary"))
            VStack(alignment: .leading, spacing: QTheme.space3) {
                if let a = vm.selectedAddress {
                    reviewLine(icon: "mappin.and.ellipse", title: a.label ?? lang.t("address.unnamed"), detail: a.summary)
                }
                reviewLine(icon: vm.paymentMethod == .online ? "creditcard" : "banknote",
                           title: lang.t("payment.\(vm.paymentMethod.rawValue)"), detail: vm.notes)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
            VStack(alignment: .leading, spacing: QTheme.space3) {
                breakdown
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
        }
    }

    private func reviewLine(icon: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: QTheme.space3) {
            Image(systemName: icon).foregroundColor(QTheme.tint).frame(width: 24).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).qFont(.body, .semibold).foregroundColor(QTheme.ink)
                if !detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(detail).qFont(.small).foregroundColor(QTheme.muted)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var breakdown: some View {
        if vm.isQuoting && vm.quote == nil {
            QSkeleton(height: 14)
            QSkeleton(width: 160, height: 14)
        } else if let q = vm.quote {
            KeyValueRow(label: lang.t("checkout.subtotal"), value: lang.money(q.subtotalBaisa))
            KeyValueRow(label: lang.t("checkout.delivery_fee"), value: lang.money(q.deliveryFeeBaisa))
            if q.serviceFeeBaisa > 0 {
                KeyValueRow(label: lang.t("checkout.service_fee"), value: lang.money(q.serviceFeeBaisa))
            }
            if q.discountBaisa > 0 {
                KeyValueRow(label: lang.t("checkout.discount"), value: "-" + lang.money(q.discountBaisa),
                            valueColor: QTheme.success)
            }
            KeyValueRow(label: lang.t(q.vatIncluded ? "checkout.vat_included" : "checkout.vat"),
                        value: lang.money(q.vatBaisa))
            Rectangle().fill(QTheme.line).frame(height: 1)
            KeyValueRow(label: lang.t("checkout.total"), value: lang.money(q.totalBaisa), bold: true)
            if let s = q.estimatedDurationS {
                Text(lang.f("checkout.eta_approx", lang.minutes(s))).qFont(.small).foregroundColor(QTheme.muted)
            }
        } else if let e = vm.quoteError {
            InlineError(error: e)
            Button(lang.t("common.retry")) { Task { await vm.requote() } }
                .buttonStyle(TertiaryButtonStyle())
        } else {
            Text(lang.t("checkout.choose_address_first")).qFont(.body).foregroundColor(QTheme.muted)
        }
    }

    // MARK: Bottom bar

    private var canContinue: Bool {
        switch step {
        case 0: return vm.selectedAddressId != nil
        case 1: return vm.allowedPaymentMethods.contains(vm.paymentMethod)
        default: return vm.canPlace
        }
    }

    private var primaryTitle: String {
        if step < 2 { return lang.t("common.continue") }
        return vm.paymentMethod == .online ? lang.t("checkout.place_and_pay") : lang.t("checkout.place_order")
    }

    private var bottomBar: some View {
        QNightBar {
            if let q = vm.quote {
                HStack {
                    Text(lang.t("checkout.total")).qFont(.body).foregroundColor(QTheme.muted)
                    Spacer()
                    QPrice(baisa: q.totalBaisa, style: .h3)
                }
            }
            HStack(spacing: QTheme.space3) {
                if step > 0 {
                    Button(lang.t("common.back")) { step -= 1 }
                        .buttonStyle(SecondaryButtonStyle())
                        .frame(maxWidth: 120)
                        .disabled(vm.isPlacing)
                        .accessibilityIdentifier("checkout.back")
                }
                Button {
                    Task { await primaryTapped() }
                } label: {
                    if vm.isPlacing { ProgressView().tint(QTheme.onCta) } else { Text(primaryTitle) }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!canContinue)
                .accessibilityIdentifier("checkout.primary")
            }
        }
    }

    private func primaryTapped() async {
        if step < 2 {
            if step == 1 { vm.scheduleQuote() } // notes may have changed
            step += 1
            return
        }
        await placeTapped()
    }

    private func placeTapped() async {
        guard let order = await vm.place() else { return }
        placedOrder = order
        if order.awaitingOnlinePayment {
            await payment.start(order: order)
            if payment.page == nil { finish() } // checkout failed to start; order remains payable from detail
        } else {
            finish()
        }
    }

    private func finish() {
        guard let order = placedOrder else { return }
        vm.clearCart()
        onClose()
        router.showOrder(order.id)
    }
}
