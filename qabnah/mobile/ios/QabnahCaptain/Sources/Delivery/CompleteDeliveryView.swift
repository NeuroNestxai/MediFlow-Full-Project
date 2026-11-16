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
            Form {
                Section {
                    TextField(lang.t("complete.pin_placeholder"), text: $vm.pin)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .font(.system(size: 32, weight: .bold, design: .monospaced))
                        .multilineTextAlignment(.center)
                        .environment(\.layoutDirection, .leftToRight)
                        .onChange(of: vm.pin) { new in
                            let cleaned = String(Digits.ascii(new).filter(\.isNumber).prefix(4))
                            if cleaned != new { vm.pin = cleaned }
                        }
                        .accessibilityLabel(lang.t("complete.pin"))
                    InlineError(error: vm.pinError)
                } header: {
                    Text(lang.t("complete.pin"))
                } footer: {
                    Text(lang.t(vm.delivery.pinRequired ? "complete.pin_required_hint" : "complete.pin_optional_hint"))
                }

                if vm.needsCod {
                    Section {
                        TextField("0.000", text: $vm.codText)
                            .keyboardType(.decimalPad)
                            .font(.title3.monospacedDigit())
                        if vm.codBaisa != vm.delivery.codAmountBaisa, let v = vm.codBaisa {
                            Text(lang.f("complete.cod_mismatch", lang.money(v), lang.money(vm.delivery.codAmountBaisa)))
                                .font(.footnote).foregroundColor(Brand.accent)
                        }
                    } header: {
                        Text(lang.f("complete.cod", lang.money(vm.delivery.codAmountBaisa)))
                    }
                }

                Section(lang.t("complete.photo")) {
                    PhotoInput(image: $vm.photo)
                }

                Section(lang.t("complete.recipient")) {
                    TextField(lang.t("complete.recipient_name"), text: $vm.recipientName).textContentType(.name)
                    TextField(lang.t("complete.note"), text: $vm.note, axis: .vertical).lineLimit(1...3)
                }

                if vm.error != nil { Section { InlineError(error: vm.error) } }
            }
            .safeAreaInset(edge: .bottom) {
                Button {
                    Task {
                        if let done = await vm.submit() {
                            onCompleted(done)
                            dismiss()
                        }
                    }
                } label: {
                    if vm.isSubmitting {
                        HStack {
                            ProgressView().tint(.white)
                            if let stage = vm.stage { Text(lang.t(stage)) }
                        }
                    } else {
                        Text(lang.t("complete.submit"))
                    }
                }
                .buttonStyle(PrimaryButtonStyle(color: Brand.success))
                .disabled(!vm.canSubmit)
                .padding()
                .background(.bar)
            }
            .navigationTitle(lang.t("action.complete"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(lang.t("common.cancel")) { dismiss() } }
            }
            .interactiveDismissDisabled(vm.isSubmitting)
        }
    }
}
