import SwiftUI
import QabnahKit

@MainActor
final class CompleteDeliveryViewModel: ObservableObject {
    @Published var pin = ""
    @Published var photo: UIImage?
    @Published var recipientName = ""
    @Published var codText: String
    @Published var note = ""
    @Published private(set) var isSubmitting = false
    @Published private(set) var stage: String?
    /// Errors shown next to the PIN field (422 wrong PIN).
    @Published var pinError: Error?
    @Published var error: Error?

    let delivery: CaptainDelivery
    private let api: APIClient

    init(api: APIClient, delivery: CaptainDelivery) {
        self.api = api
        self.delivery = delivery
        codText = delivery.codAmountBaisa > 0 ? Money.decimalString(baisa: delivery.codAmountBaisa) : ""
    }

    var pinDigits: String { String(Digits.ascii(pin).filter(\.isNumber).prefix(4)) }
    var codBaisa: Int? { Money.parse(codText) }
    var needsCod: Bool { delivery.codAmountBaisa > 0 }

    var canSubmit: Bool {
        guard !isSubmitting else { return false }
        if delivery.pinRequired && pinDigits.count != 4 && photo == nil { return false }
        if needsCod && codBaisa == nil { return false }
        return true
    }

    func submit() async -> CaptainDelivery? {
        isSubmitting = true
        defer { isSubmitting = false; stage = nil }
        pinError = nil
        error = nil
        var photoId: String?
        if let photo, let data = photo.uploadJPEG() {
            stage = "complete.uploading"
            do {
                photoId = try await api.uploadFile(data: data, fileName: "pod-\(delivery.id).jpg",
                                                   mimeType: "image/jpeg", purpose: .proofOfDelivery).id
            } catch {
                self.error = error
                return nil
            }
        }
        stage = "complete.submitting"
        let input = DeliveryCompleteInput(
            pin: pinDigits.isEmpty ? nil : pinDigits, photoFileId: photoId, recipientName: recipientName,
            codCollectedBaisa: needsCod ? codBaisa : nil, note: note)
        do {
            return try await api.send(Endpoints.completeDelivery(id: delivery.id, input))
        } catch {
            if let api = error as? APIError, api.isUnprocessable {
                let field = api.details?["field"]?.stringValue
                let mentionsPin = (api.code ?? "").contains("pin") || field == "pin"
                    || (api.serverMessage ?? "").lowercased().contains("pin")
                if mentionsPin { pinError = error } else { self.error = error }
            } else {
                self.error = error
            }
            return nil
        }
    }
}

/// Completion: four large PIN boxes, cash collected, proof photo, recipient — and one saffron
/// "confirm delivery" action in the bottom bar.
struct CompleteDeliveryView: View {
    @EnvironmentObject var lang: LanguageSettings
    @Environment(\.dismiss) var dismiss
    @StateObject private var vm: CompleteDeliveryViewModel
    let onCompleted: (CaptainDelivery) -> Void

    init(api: APIClient, delivery: CaptainDelivery, onCompleted: @escaping (CaptainDelivery) -> Void) {
        _vm = StateObject(wrappedValue: CompleteDeliveryViewModel(api: api, delivery: delivery))
        self.onCompleted = onCompleted
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: QTheme.space5) {
                    pinSection
                    if vm.needsCod { codSection }
                    photoSection
                    recipientSection
                    InlineError(error: vm.error)
                }
                .padding(QTheme.space4)
            }
            .qScreen()
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) { submitBar }
            .navigationTitle(lang.t("action.complete"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(lang.t("common.cancel")) { dismiss() } }
            }
            .interactiveDismissDisabled(vm.isSubmitting)
        }
        .qSheet()
    }

    private var pinSection: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            Text(lang.t("complete.pin")).qFont(.h3).foregroundColor(QTheme.ink)
            PinBoxes(pin: $vm.pin, label: lang.t("complete.pin"), hasError: vm.pinError != nil)
            InlineError(error: vm.pinError)
            Text(lang.t(vm.delivery.pinRequired ? "complete.pin_required_hint" : "complete.pin_optional_hint"))
                .qFont(.small)
                .foregroundColor(QTheme.muted)
        }
    }

    private var codSection: some View {
        VStack(alignment: .leading, spacing: QTheme.space2) {
            Text(lang.f("complete.cod", lang.money(vm.delivery.codAmountBaisa))).qFont(.h3).foregroundColor(QTheme.ink)
            TextField("0.000", text: $vm.codText)
                .keyboardType(.decimalPad)
                .qFont(.h2, tabular: true)
                .environment(\.layoutDirection, .leftToRight)
                .qField()
                .accessibilityLabel(lang.f("complete.cod", lang.money(vm.delivery.codAmountBaisa)))
            if vm.codBaisa != vm.delivery.codAmountBaisa, let v = vm.codBaisa {
                Text(lang.f("complete.cod_mismatch", lang.money(v), lang.money(vm.delivery.codAmountBaisa)))
                    .qFont(.small)
                    .foregroundColor(QTheme.warning)
            }
        }
    }

    private var photoSection: some View {
        VStack(alignment: .leading, spacing: QTheme.space2) {
            Text(lang.t("complete.photo")).qFont(.h3).foregroundColor(QTheme.ink)
            PhotoInput(image: $vm.photo)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private var recipientSection: some View {
        VStack(alignment: .leading, spacing: QTheme.space2) {
            Text(lang.t("complete.recipient")).qFont(.h3).foregroundColor(QTheme.ink)
            TextField(lang.t("complete.recipient_name"), text: $vm.recipientName).textContentType(.name).qField()
            TextField(lang.t("complete.note"), text: $vm.note, axis: .vertical)
                .lineLimit(1...3)
                .padding(.vertical, QTheme.space2)
                .qField()
        }
    }

    private var submitBar: some View {
        QNightBar {
            Button {
                Task {
                    if let done = await vm.submit() {
                        onCompleted(done)
                        dismiss()
                    }
                }
            } label: {
                if vm.isSubmitting {
                    HStack(spacing: QTheme.space2) {
                        ProgressView().tint(QTheme.inkOnLight)
                        if let stage = vm.stage { Text(lang.t(stage)) }
                    }
                } else {
                    Text(lang.t("complete.submit"))
                }
            }
            .buttonStyle(SaffronButtonStyle())
            .disabled(!vm.canSubmit)
        }
    }
}

/// Four large digit boxes backed by one hidden number-pad field (so paste and the SMS-style
/// one-time-code keyboard keep working). Always laid out left to right.
struct PinBoxes: View {
    @Binding var pin: String
    let label: String
    var hasError = false
    @FocusState private var focused: Bool

    private var digits: [String] {
        let chars = Array(Digits.ascii(pin).filter(\.isNumber).prefix(4)).map { String($0) }
        return chars + Array(repeating: "", count: max(0, 4 - chars.count))
    }

    var body: some View {
        ZStack {
            TextField("", text: $pin)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused($focused)
                .foregroundColor(.clear)
                .tint(.clear)
                .frame(maxWidth: .infinity, minHeight: 72)
                .onChange(of: pin) { new in
                    let cleaned = String(Digits.ascii(new).filter(\.isNumber).prefix(4))
                    if cleaned != new { pin = cleaned }
                }
                .accessibilityLabel(label)
            HStack(spacing: QTheme.space3) {
                ForEach(0..<4, id: \.self) { index in
                    box(index)
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
        .environment(\.layoutDirection, .leftToRight)
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
    }

    private func box(_ index: Int) -> some View {
        let digit = digits[index]
        let active = focused && index == min(3, digits.filter { !$0.isEmpty }.count)
        let stroke: Color = hasError ? QTheme.danger : (active ? QTheme.saffron : QTheme.line)
        return Text(verbatim: digit)
            .qFont(size: 34, .bold, relativeTo: .title, tabular: true)
            .foregroundColor(QTheme.ink)
            .frame(maxWidth: .infinity, minHeight: 72)
            .background(QTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusSm, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: QTheme.radiusSm, style: .continuous)
                .stroke(stroke, lineWidth: active || hasError ? 2 : 1))
    }
}
