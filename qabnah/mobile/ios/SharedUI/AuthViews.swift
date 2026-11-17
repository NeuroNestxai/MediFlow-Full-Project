import SwiftUI
import QabnahKit

@MainActor
final class AuthViewModel: ObservableObject {
    enum Step { case phone, code, name }

    @Published var step: Step = .phone
    @Published var phoneInput = ""
    @Published var code = ""
    @Published var fullName = ""
    @Published private(set) var devCode: String?
    @Published private(set) var isBusy = false
    @Published var error: Error?
    @Published private(set) var resendAvailableAt: Date?

    private let api: APIClient
    private var pendingResult: AuthResult?
    private(set) var phoneE164: String?

    init(api: APIClient) { self.api = api }

    var normalizedPhone: String? { PhoneNumber.normalizeOmaniMobile(phoneInput) }
    var canRequestCode: Bool { normalizedPhone != nil && !isBusy }
    var canVerify: Bool { Digits.ascii(code).filter(\.isNumber).count >= 4 && !isBusy }

    func requestCode() async {
        guard let phone = normalizedPhone else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            let result = try await api.send(Endpoints.requestOTP(phone: phone))
            phoneE164 = phone
            devCode = result.devCode
            code = ""
            error = nil
            resendAvailableAt = Date().addingTimeInterval(30)
            step = .code
        } catch {
            self.error = error
        }
    }

    /// Verifies the code. Returns the auth result when sign-in is complete; when the server
    /// reports a brand-new user without a name, moves to the name step first.
    func verify() async -> AuthResult? {
        guard let phone = phoneE164 else { return nil }
        isBusy = true
        defer { isBusy = false }
        let name = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let result = try await api.send(Endpoints.verifyOTP(
                phone: phone, code: Digits.ascii(code).filter(\.isNumber), fullName: name.isEmpty ? nil : name))
            error = nil
            if (result.isNewUser ?? false) && (result.user?.fullName.isEmpty ?? true) && name.isEmpty {
                pendingResult = result
                api.signIn(with: result) // needed to PATCH /me
                step = .name
                return nil
            }
            return result
        } catch {
            self.error = error
            return nil
        }
    }

    /// Saves the name for a new account (PATCH /me) and completes sign-in.
    func saveName() async -> AuthResult? {
        guard let result = pendingResult else { return nil }
        let name = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return nil }
        isBusy = true
        defer { isBusy = false }
        do {
            _ = try await api.send(Endpoints.updateMe(ProfileUpdateInput(fullName: name)))
            return result
        } catch {
            self.error = error
            return nil
        }
    }

    func editPhone() {
        step = .phone
        code = ""
        devCode = nil
        error = nil
    }
}

/// Phone → OTP (→ name) sign-in used by both apps.
struct AuthFlowView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @StateObject private var vm: AuthViewModel
    let subtitleKey: String
    /// When set (sign-in presented as a sheet, e.g. at checkout), shows a Cancel button.
    var onCancel: (() -> Void)?

    init(api: APIClient, subtitleKey: String, onCancel: (() -> Void)? = nil) {
        _vm = StateObject(wrappedValue: AuthViewModel(api: api))
        self.subtitleKey = subtitleKey
        self.onCancel = onCancel
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: QTheme.space5) {
                    header
                    switch vm.step {
                    case .phone: phoneStep
                    case .code: codeStep
                    case .name: nameStep
                    }
                    InlineError(error: vm.error)
                    LanguagePicker().padding(.top, QTheme.space6)
                }
                .padding(QTheme.space6)
            }
            .scrollDismissesKeyboard(.interactively)
            .qScreen()
            .toolbar {
                if let onCancel {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(lang.t("common.cancel"), action: onCancel)
                            .accessibilityIdentifier("auth.cancel")
                    }
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: QTheme.space2) {
            Image("BrandMark")
                .resizable()
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous))
                .accessibilityHidden(true)
            Text(lang.t("app.name")).qFont(.h1).foregroundColor(QTheme.ink)
            Text(lang.t(subtitleKey)).qFont(.body).foregroundColor(QTheme.muted)
        }
        .padding(.top, QTheme.space6)
    }

    private var phoneStep: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            Text(lang.t("auth.phone_title")).qFont(.h3).foregroundColor(QTheme.ink)
            HStack(spacing: QTheme.space2) {
                Text(verbatim: "+968")
                    .qFont(.h3, tabular: true)
                    .foregroundColor(QTheme.ink)
                    .qField()
                TextField(lang.t("auth.phone_placeholder"), text: $vm.phoneInput)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .qFont(.h3, tabular: true)
                    .qField()
                    .accessibilityLabel(lang.t("auth.phone_title"))
                    .accessibilityIdentifier("auth.phone")
            }
            .environment(\.layoutDirection, .leftToRight) // phone numbers read LTR
            Text(lang.t("auth.phone_hint")).qFont(.small).foregroundColor(QTheme.muted)
            Button {
                Task { await vm.requestCode() }
            } label: {
                if vm.isBusy { ProgressView().tint(QTheme.onCta) } else { Text(lang.t("auth.send_code")) }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!vm.canRequestCode)
            .accessibilityIdentifier("auth.sendCode")
        }
    }

    private var codeStep: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            Text(lang.t("auth.code_title")).qFont(.h3).foregroundColor(QTheme.ink)
            if let phone = vm.phoneE164 {
                HStack(spacing: QTheme.space2) {
                    Text(lang.t("auth.code_sent_to"))
                    Text(verbatim: PhoneNumber.display(phone)).environment(\.layoutDirection, .leftToRight)
                    Button(lang.t("auth.change_number")) { vm.editPhone() }
                        .buttonStyle(TertiaryButtonStyle())
                }
                .qFont(.small)
                .foregroundColor(QTheme.muted)
            }
            if let dev = vm.devCode { DevCodeBanner(code: dev) }
            TextField(lang.t("auth.code_placeholder"), text: $vm.code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .multilineTextAlignment(.center)
                .qFont(.h2, tabular: true)
                .qField()
                .accessibilityLabel(lang.t("auth.code_title"))
                .accessibilityIdentifier("auth.code")
            TextField(lang.t("auth.full_name_optional"), text: $vm.fullName)
                .textContentType(.name)
                .qField()
            Button {
                Task {
                    if let result = await vm.verify() { session.didSignIn(result) }
                }
            } label: {
                if vm.isBusy { ProgressView().tint(QTheme.onCta) } else { Text(lang.t("auth.verify")) }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!vm.canVerify)
            .accessibilityIdentifier("auth.verify")

            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                let remaining = Int((vm.resendAvailableAt ?? .distantPast).timeIntervalSince(ctx.date))
                Button(remaining > 0 ? lang.f("auth.resend_in", remaining) : lang.t("auth.resend")) {
                    Task { await vm.requestCode() }
                }
                .buttonStyle(TertiaryButtonStyle())
                .disabled(remaining > 0 || vm.isBusy)
            }
        }
    }

    private var nameStep: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            Text(lang.t("auth.name_title")).qFont(.h3).foregroundColor(QTheme.ink)
            TextField(lang.t("auth.full_name"), text: $vm.fullName)
                .textContentType(.name)
                .qField()
                .accessibilityIdentifier("auth.name")
            Button {
                Task {
                    if let result = await vm.saveName() { session.didSignIn(result) }
                }
            } label: {
                if vm.isBusy { ProgressView().tint(QTheme.onCta) } else { Text(lang.t("common.continue")) }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(vm.fullName.trimmingCharacters(in: .whitespaces).isEmpty || vm.isBusy)
            .accessibilityIdentifier("auth.saveName")
        }
    }
}

/// Presents the OTP sign-in as a sheet (guest browsing → checkout / orders / account) and calls
/// `onSignedIn` once the sheet has closed with a signed-in session, so the caller can continue
/// where the user was going.
struct SignInSheetModifier: ViewModifier {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @Binding var isPresented: Bool
    let subtitleKey: String
    let onSignedIn: () -> Void

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $isPresented, onDismiss: dismissed) {
                AuthFlowView(api: session.api, subtitleKey: subtitleKey, onCancel: cancel)
                    .environmentObject(lang)
                    .environmentObject(session)
                    .qabnahLocalized(lang)
            }
            .onChange(of: session.isSignedIn) { signedIn in
                if signedIn && isPresented { isPresented = false }
            }
    }

    private func dismissed() {
        if session.isSignedIn {
            onSignedIn()
        } else if session.api.isSignedIn {
            // Closed at the "your name" step: drop the tokens stored for PATCH /me so the app
            // doesn't come back signed in on the next launch without the user finishing.
            session.api.clearSession()
        }
    }

    private func cancel() {
        isPresented = false
    }
}

extension View {
    func signInSheet(isPresented: Binding<Bool>, subtitleKey: String,
                     onSignedIn: @escaping () -> Void = {}) -> some View {
        modifier(SignInSheetModifier(isPresented: isPresented, subtitleKey: subtitleKey, onSignedIn: onSignedIn))
    }
}
