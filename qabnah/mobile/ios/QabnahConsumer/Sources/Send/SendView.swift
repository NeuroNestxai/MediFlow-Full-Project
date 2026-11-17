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

/// Send a parcel as a three-step wizard: route (pickup and drop-off), package, payment and price.
struct SendView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var router: ConsumerRouter
    @StateObject private var vm: SendViewModel
    @StateObject private var payment: PaymentFlow
    @State private var pinTarget: PinTarget? = nil
    @State private var createdOrder: Order? = nil
    @State private var step = 0

    enum PinTarget: String, Identifiable { case pickup, dropoff; var id: String { rawValue } }

    init(api: APIClient) {
        _vm = StateObject(wrappedValue: SendViewModel(api: api))
        _payment = StateObject(wrappedValue: PaymentFlow(api: api))
    }

    private var stepTitles: [String] {
        [lang.t("send.route"), lang.t("send.package"), lang.t("checkout.payment")]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: QTheme.space5) {
                    QStepProgress(titles: stepTitles, current: step)
                    stepContent
                    InlineError(error: vm.createError)
                    InlineError(error: payment.error)
                }
                .padding(QTheme.space4)
            }
            .qScreen()
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) { bottomBar }
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

    @ViewBuilder private var stepContent: some View {
        switch step {
        case 0: routeStep
        case 1: packageStep
        default: paymentStep
        }
    }

    // MARK: Step 1 — route

    private var routeStep: some View {
        VStack(alignment: .leading, spacing: QTheme.space4) {
            if !routePoints.isEmpty {
                RouteMapView(points: routePoints, dashedFrom: vm.pickup.location.map { CLLocationCoordinate2D($0) },
                             dashedTo: vm.dropoff.location.map { CLLocationCoordinate2D($0) }, showsRecenterButton: false)
                    .frame(height: 170)
                    .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous))
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            placeCard(.pickup, draft: $vm.pickup)
            placeCard(.dropoff, draft: $vm.dropoff)
        }
    }

    private var routePoints: [MapPoint] {
        var out: [MapPoint] = []
        if let p = vm.pickup.location {
            out.append(MapPoint(id: "pickup", kind: .pickup, coordinate: CLLocationCoordinate2D(p), label: lang.t("send.pickup")))
        }
        if let d = vm.dropoff.location {
            out.append(MapPoint(id: "dropoff", kind: .dropoff, coordinate: CLLocationCoordinate2D(d), label: lang.t("send.dropoff")))
        }
        return out
    }

    private func placeCard(_ target: PinTarget, draft: Binding<PlaceDraft>) -> some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            Text(lang.t("send.\(target.rawValue)")).qFont(.h3).foregroundColor(QTheme.ink)
            Button { pinTarget = target } label: {
                HStack(spacing: QTheme.space2) {
                    Image(systemName: "mappin.and.ellipse").accessibilityHidden(true)
                    Text(draft.wrappedValue.location == nil ? lang.t("send.\(target.rawValue)_pin") : lang.t("address.move_pin"))
                    Spacer(minLength: 0)
                    if draft.wrappedValue.location != nil {
                        Image(systemName: "checkmark.circle.fill").foregroundColor(QTheme.success).accessibilityHidden(true)
                    }
                }
            }
            .buttonStyle(SecondaryButtonStyle(compact: true))
            TextField(lang.t("send.address_text"), text: draft.address).qField()
            TextField(lang.t("address.contact_name"), text: draft.contactName).textContentType(.name).qField()
            TextField(lang.t("address.contact_phone"), text: draft.contactPhone)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .qField()
            TextField(lang.t("send.place_notes"), text: draft.notes).qField()
        }
        .card()
    }

    // MARK: Step 2 — package

    private var packageStep: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            QSectionTitle(text: lang.t("send.package"))
            Text(lang.t("send.size")).qFont(.small, .medium).foregroundColor(QTheme.muted)
            Picker(lang.t("send.size"), selection: $vm.size) {
                ForEach(PackageSize.knownCases, id: \.self) { s in
                    Text(lang.t("package.\(s.rawValue)")).tag(s)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            TextField(lang.t("send.description"), text: $vm.packageDescription).qField()
            TextField(lang.t("send.notes"), text: $vm.notes, axis: .vertical)
                .lineLimit(1...3)
                .padding(.vertical, QTheme.space2)
                .qField()
        }
    }

    // MARK: Step 3 — payment and price

    private var paymentStep: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            QSectionTitle(text: lang.t("checkout.payment"))
            methodRow(.online, icon: "creditcard")
            methodRow(.cod, icon: "banknote")
            if vm.paymentMethod == .cod {
                Text(lang.t("send.cod_payer")).qFont(.small, .medium).foregroundColor(QTheme.muted)
                Picker(lang.t("send.cod_payer"), selection: $vm.codPayer) {
                    Text(lang.t("cod_payer.sender")).tag(CodPayer.sender)
                    Text(lang.t("cod_payer.recipient")).tag(CodPayer.recipient)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }
            VStack(alignment: .leading, spacing: QTheme.space3) {
                Text(lang.t("send.quote")).qFont(.h3).foregroundColor(QTheme.ink)
                quoteRows
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
            .padding(.top, QTheme.space2)
        }
    }

    private func methodRow(_ method: PaymentMethod, icon: String) -> some View {
        let selected = vm.paymentMethod == method
        return Button { vm.paymentMethod = method } label: {
            QChoiceRow(selected: selected) {
                Image(systemName: icon).foregroundColor(QTheme.muted).accessibilityHidden(true)
                Text(lang.t("payment.\(method.rawValue)")).qFont(.body).foregroundColor(QTheme.ink)
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder private var quoteRows: some View {
        if vm.isQuoting {
            QSkeleton(height: 14)
            QSkeleton(width: 160, height: 14)
        } else if let q = vm.quote {
            KeyValueRow(label: lang.t("checkout.delivery_fee"), value: lang.money(q.feeBaisa), bold: true)
            KeyValueRow(label: lang.t("send.distance"), value: lang.distance(q.distanceM))
            KeyValueRow(label: lang.t("send.duration"), value: lang.f("send.duration_approx", lang.minutes(q.estimatedDurationS)))
            if q.zoneId == nil {
                Text(lang.t("address.out_of_area")).qFont(.small).foregroundColor(QTheme.danger)
            }
        } else if let e = vm.quoteError {
            InlineError(error: e)
        } else {
            Text(lang.t("send.quote_hint")).qFont(.body).foregroundColor(QTheme.muted)
        }
    }

    // MARK: Bottom bar

    private var canContinue: Bool {
        switch step {
        case 0: return vm.pickup.isComplete && vm.dropoff.isComplete
        case 1: return !vm.packageDescription.trimmingCharacters(in: .whitespaces).isEmpty
        default: return vm.canSubmit
        }
    }

    private var bottomBar: some View {
        QNightBar {
            if let q = vm.quote {
                HStack {
                    Text(lang.t("checkout.delivery_fee")).qFont(.body).foregroundColor(QTheme.muted)
                    Spacer()
                    QPrice(baisa: q.feeBaisa, style: .h3)
                }
            }
            HStack(spacing: QTheme.space3) {
                if step > 0 {
                    Button(lang.t("common.back")) { step -= 1 }
                        .buttonStyle(SecondaryButtonStyle())
                        .frame(maxWidth: 120)
                        .disabled(vm.isCreating)
                }
                Button {
                    Task { await primaryTapped() }
                } label: {
                    if vm.isCreating {
                        ProgressView().tint(QTheme.onCta)
                    } else {
                        Text(step < 2 ? lang.t("common.continue") : lang.t("send.submit"))
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!canContinue)
                .accessibilityIdentifier("send.primary")
            }
        }
    }

    private func primaryTapped() async {
        if step < 2 {
            step += 1
            return
        }
        await submit()
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
        step = 0
        router.showOrder(order.id)
    }
}
