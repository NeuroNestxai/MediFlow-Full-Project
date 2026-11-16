import SwiftUI
import MapKit
import QabnahKit

/// Editable pickup / dropoff for a C2C shipment.
struct PlaceDraft: Equatable {
    var location: LatLng?
    var address = ""
    var contactName = ""
    var contactPhone = ""
    var notes = ""

    var isComplete: Bool {
        location != nil && !contactName.trimmingCharacters(in: .whitespaces).isEmpty
            && PhoneNumber.normalizeOmaniMobile(contactPhone) != nil
    }

    var input: PlaceInput? {
        guard let location else { return nil }
        func clean(_ s: String) -> String? {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }
        return PlaceInput(location: location, address: clean(address), contactName: clean(contactName),
                          contactPhone: PhoneNumber.normalizeOmaniMobile(contactPhone) ?? clean(contactPhone),
                          notes: clean(notes))
    }
}

@MainActor
final class SendViewModel: ObservableObject {
    @Published var pickup = PlaceDraft() { didSet { if oldValue.location != pickup.location { scheduleQuote() } } }
    @Published var dropoff = PlaceDraft() { didSet { if oldValue.location != dropoff.location { scheduleQuote() } } }
    @Published var size: PackageSize = .small
    @Published var packageDescription = ""
    @Published var paymentMethod: PaymentMethod = .cod
    @Published var codPayer: CodPayer = .sender
    @Published var notes = ""
    @Published private(set) var quote: DeliveryQuote?
    @Published private(set) var quoteError: Error?
    @Published private(set) var isQuoting = false
    @Published private(set) var isCreating = false
    @Published var createError: Error?

    private let api: APIClient
    private var quoteTask: Task<Void, Never>?
    private var idempotency: (fingerprint: String, key: String)?

    init(api: APIClient) { self.api = api }

    func prefillSender(_ user: User?) {
        guard let user, pickup.contactName.isEmpty, pickup.contactPhone.isEmpty else { return }
        pickup.contactName = user.fullName
        pickup.contactPhone = user.phone ?? ""
    }

    var canSubmit: Bool {
        pickup.isComplete && dropoff.isComplete
            && !packageDescription.trimmingCharacters(in: .whitespaces).isEmpty
            && quote != nil && !isCreating
    }

    func scheduleQuote() {
        quoteTask?.cancel()
        quoteTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            await self?.requote()
        }
    }

    func requote() async {
        guard let p = pickup.location, let d = dropoff.location else { quote = nil; return }
        isQuoting = true
        defer { isQuoting = false }
        do {
            quote = try await api.send(Endpoints.deliveryQuote(DeliveryQuoteInput(type: .c2c, pickup: p, dropoff: d)))
            quoteError = nil
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            quote = nil
            quoteError = error
        }
    }

    func create() async -> Order? {
        guard let p = pickup.input, let d = dropoff.input else { return nil }
        let input = ShipmentInput(
            pickup: p, dropoff: d,
            package: .init(size: size, description: packageDescription.trimmingCharacters(in: .whitespacesAndNewlines)),
            paymentMethod: paymentMethod, codPayer: codPayer,
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : notes)
        let fingerprint = (try? String(decoding: JSONEncoder.qabnah.encode(input), as: UTF8.self)) ?? UUID().uuidString
        if idempotency?.fingerprint != fingerprint { idempotency = (fingerprint, UUID().uuidString) }
        isCreating = true
        defer { isCreating = false }
        do {
            let order = try await api.send(Endpoints.createShipment(input, idempotencyKey: idempotency!.key))
            createError = nil
            return order
        } catch {
            createError = error
            return nil
        }
    }

    func reset() {
        pickup = PlaceDraft()
        dropoff = PlaceDraft()
        packageDescription = ""
        notes = ""
        quote = nil
        idempotency = nil
    }
}

struct SendView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var router: ConsumerRouter
    @StateObject private var vm: SendViewModel
    @StateObject private var payment: PaymentFlow
    @State private var pinTarget: PinTarget? = nil
    @State private var createdOrder: Order? = nil

    enum PinTarget: String, Identifiable { case pickup, dropoff; var id: String { rawValue } }

    init(api: APIClient) {
        _vm = StateObject(wrappedValue: SendViewModel(api: api))
        _payment = StateObject(wrappedValue: PaymentFlow(api: api))
    }

    var body: some View {
        NavigationStack {
            Form {
                placeSection(.pickup, draft: $vm.pickup)
                placeSection(.dropoff, draft: $vm.dropoff)
                Section(lang.t("send.package")) {
                    Picker(lang.t("send.size"), selection: $vm.size) {
                        ForEach(PackageSize.knownCases, id: \.self) { s in
                            Text(lang.t("package.\(s.rawValue)")).tag(s)
                        }
                    }
                    .pickerStyle(.segmented)
                    TextField(lang.t("send.description"), text: $vm.packageDescription)
                    TextField(lang.t("send.notes"), text: $vm.notes, axis: .vertical).lineLimit(1...3)
                }
                Section(lang.t("checkout.payment")) {
                    Picker(lang.t("checkout.payment"), selection: $vm.paymentMethod) {
                        Text(lang.t("payment.online")).tag(PaymentMethod.online)
                        Text(lang.t("payment.cod")).tag(PaymentMethod.cod)
                    }
                    .pickerStyle(.segmented)
                    if vm.paymentMethod == .cod {
                        Picker(lang.t("send.cod_payer"), selection: $vm.codPayer) {
                            Text(lang.t("cod_payer.sender")).tag(CodPayer.sender)
                            Text(lang.t("cod_payer.recipient")).tag(CodPayer.recipient)
                        }
                    }
                }
                quoteSection
                if vm.createError != nil || payment.error != nil {
                    Section {
                        InlineError(error: vm.createError)
                        InlineError(error: payment.error)
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button {
                    Task { await submit() }
                } label: {
                    if vm.isCreating { ProgressView().tint(.white) } else { Text(lang.t("send.submit")) }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!vm.canSubmit)
                .padding()
                .background(.bar)
            }
            .navigationTitle(lang.t("send.title"))
            .overlay { PaymentPollingOverlay(flow: payment) }
            .paymentSheet(payment) { _ in finish() }
            .fullScreenCover(item: $pinTarget) { target in
                PinPickerView(title: lang.t("send.\(target.rawValue)_pin"),
                              initial: target == .pickup ? vm.pickup.location : vm.dropoff.location) { loc in
                    if target == .pickup { vm.pickup.location = loc } else { vm.dropoff.location = loc }
                }
                .environmentObject(lang)
                .qabnahLocalized(lang)
            }
            .onAppear { vm.prefillSender(session.me?.user) }
        }
    }

    private func placeSection(_ target: PinTarget, draft: Binding<PlaceDraft>) -> some View {
        Section(lang.t("send.\(target.rawValue)")) {
            Button { pinTarget = target } label: {
                HStack {
                    Image(systemName: target == .pickup ? "shippingbox" : "flag.checkered")
                        .foregroundColor(target == .pickup ? Brand.accent : Brand.primary)
                        .accessibilityHidden(true)
                    if let loc = draft.wrappedValue.location {
                        Text(verbatim: String(format: "%.5f, %.5f", loc.lat, loc.lng))
                            .font(.subheadline.monospacedDigit())
                        Spacer()
                        Text(lang.t("address.move_pin")).font(.footnote)
                    } else {
                        Text(lang.t("send.\(target.rawValue)_pin"))
                    }
                }
            }
            TextField(lang.t("send.address_text"), text: draft.address)
            TextField(lang.t("address.contact_name"), text: draft.contactName).textContentType(.name)
            TextField(lang.t("address.contact_phone"), text: draft.contactPhone)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
            TextField(lang.t("send.place_notes"), text: draft.notes)
        }
    }

    private var quoteSection: some View {
        Section(lang.t("send.quote")) {
            if vm.isQuoting {
                ProgressView()
            } else if let q = vm.quote {
                KeyValueRow(label: lang.t("checkout.delivery_fee"), value: lang.money(q.feeBaisa), bold: true)
                KeyValueRow(label: lang.t("send.distance"), value: lang.distance(q.distanceM))
                KeyValueRow(label: lang.t("send.duration"), value: lang.f("send.duration_approx", lang.minutes(q.estimatedDurationS)))
                if q.zoneId == nil {
                    Text(lang.t("address.out_of_area")).font(.footnote).foregroundColor(Brand.danger)
                }
            } else if let e = vm.quoteError {
                InlineError(error: e)
            } else {
                Text(lang.t("send.quote_hint")).foregroundColor(.secondary)
            }
        }
    }

    private func submit() async {
        guard let order = await vm.create() else { return }
        createdOrder = order
        if order.awaitingOnlinePayment {
            await payment.start(order: order)
            if payment.page == nil { finish() }
        } else {
            finish()
        }
    }

    private func finish() {
        guard let order = createdOrder else { return }
        createdOrder = nil
        vm.reset()
        router.showOrder(order.id)
    }
}
