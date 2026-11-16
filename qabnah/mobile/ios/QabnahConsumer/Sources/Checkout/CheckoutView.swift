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

struct CheckoutView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var router: ConsumerRouter
    @StateObject private var vm: CheckoutViewModel
    @StateObject private var payment: PaymentFlow
    @State private var showNewAddress = false
    @State private var placedOrder: Order? = nil
    private let api: APIClient
    let onClose: () -> Void

    init(api: APIClient, cart: CartStore, onClose: @escaping () -> Void) {
        self.api = api
        self.onClose = onClose
        _vm = StateObject(wrappedValue: CheckoutViewModel(api: api, cart: cart))
        _payment = StateObject(wrappedValue: PaymentFlow(api: api))
    }

    var body: some View {
        Form {
            addressSection
            paymentSection
            Section(lang.t("checkout.notes")) {
                TextField(lang.t("checkout.notes_placeholder"), text: $vm.notes, axis: .vertical)
                    .lineLimit(1...3)
                    .onSubmit { vm.scheduleQuote() }
            }
            summarySection
            if vm.placeError != nil || payment.error != nil {
                Section {
                    InlineError(error: vm.placeError)
                    InlineError(error: payment.error)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button {
                Task { await placeTapped() }
            } label: {
                if vm.isPlacing {
                    ProgressView().tint(.white)
                } else {
                    Text(vm.paymentMethod == .online ? lang.t("checkout.place_and_pay") : lang.t("checkout.place_order"))
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!vm.canPlace)
            .padding()
            .background(.bar)
        }
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

    private var addressSection: some View {
        Section(lang.t("checkout.deliver_to")) {
            switch vm.addresses {
            case .idle, .loading:
                ProgressView()
            case .failed(let e):
                ErrorStateView(error: e) { Task { await vm.loadAddresses() } }
            case .loaded(let list):
                ForEach(list) { a in
                    Button { vm.selectedAddressId = a.id } label: {
                        HStack {
                            Image(systemName: vm.selectedAddressId == a.id ? "largecircle.fill.circle" : "circle")
                                .foregroundColor(Brand.primary)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading) {
                                Text(a.label ?? lang.t("address.unnamed")).font(.headline)
                                Text(a.summary).font(.caption).foregroundColor(.secondary)
                                if !a.isInServiceArea {
                                    Text(lang.t("address.out_of_area")).font(.caption).foregroundColor(Brand.danger)
                                }
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(vm.selectedAddressId == a.id ? .isSelected : [])
                }
                Button { showNewAddress = true } label: {
                    Label(lang.t("checkout.drop_pin"), systemImage: "mappin.and.ellipse")
                }
            }
        }
    }

    private var paymentSection: some View {
        Section(lang.t("checkout.payment")) {
            if vm.allowedPaymentMethods.isEmpty {
                Text(lang.t("checkout.no_payment_methods")).foregroundColor(Brand.danger)
            } else {
                Picker(lang.t("checkout.payment"), selection: $vm.paymentMethod) {
                    ForEach(vm.allowedPaymentMethods, id: \.self) { m in
                        Text(lang.t("payment.\(m.rawValue)")).tag(m)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }
        }
    }

    private var summarySection: some View {
        Section(lang.t("checkout.summary")) {
            if vm.isQuoting && vm.quote == nil {
                ProgressView()
            } else if let q = vm.quote {
                KeyValueRow(label: lang.t("checkout.subtotal"), value: lang.money(q.subtotalBaisa))
                KeyValueRow(label: lang.t("checkout.delivery_fee"), value: lang.money(q.deliveryFeeBaisa))
                if q.serviceFeeBaisa > 0 {
                    KeyValueRow(label: lang.t("checkout.service_fee"), value: lang.money(q.serviceFeeBaisa))
                }
                if q.discountBaisa > 0 {
                    KeyValueRow(label: lang.t("checkout.discount"), value: "-" + lang.money(q.discountBaisa),
                                valueColor: Brand.success)
                }
                KeyValueRow(label: lang.t(q.vatIncluded ? "checkout.vat_included" : "checkout.vat"),
                            value: lang.money(q.vatBaisa))
                KeyValueRow(label: lang.t("checkout.total"), value: lang.money(q.totalBaisa), bold: true)
                if let s = q.estimatedDurationS {
                    Text(lang.f("checkout.eta_approx", lang.minutes(s))).font(.caption).foregroundColor(.secondary)
                }
            } else if let e = vm.quoteError {
                InlineError(error: e)
                Button(lang.t("common.retry")) { Task { await vm.requote() } }
            } else {
                Text(lang.t("checkout.choose_address_first")).foregroundColor(.secondary)
            }
        }
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
