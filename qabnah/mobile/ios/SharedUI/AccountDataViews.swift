import SwiftUI
import UIKit
import QabnahKit

/// A local file handed to the share sheet.
struct SharedFile: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// `UIActivityViewController` (share / save to Files / AirDrop).
struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

/// PDPL data-subject rights: `GET /me/export` (download my data) and `POST /me/delete`.
@MainActor
final class AccountDataViewModel: ObservableObject {
    @Published private(set) var isExporting = false
    @Published var exportFile: SharedFile?
    @Published var exportError: Error?
    private var exportedURL: URL?

    func export(api: APIClient, app: ClientApp) async {
        isExporting = true
        defer { isExporting = false }
        do {
            let data = try await api.data(for: Endpoints.exportMyData())
            let url = try DataExport.write(data, app: app)
            exportError = nil
            exportedURL = url
            exportFile = SharedFile(url: url)
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            exportError = error
        }
    }

    /// The export holds personal data: don't leave it in the temporary directory.
    func exportClosed() {
        if let url = exportedURL { try? FileManager.default.removeItem(at: url) }
        exportedURL = nil
        exportFile = nil
    }
}

/// "Your data" rows for Account (consumer) and Profile (captain).
struct AccountDataSection: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @StateObject private var vm = AccountDataViewModel()
    @State private var showDelete = false

    var body: some View {
        Section {
            exportButton
            InlineError(error: vm.exportError)
            deleteButton
        } header: {
            Text(lang.t("account.your_data"))
        } footer: {
            Text(lang.t("account.export_hint"))
        }
    }

    private var exportButton: some View {
        Button {
            Task { await vm.export(api: session.api, app: session.app) }
        } label: {
            HStack {
                Label(lang.t("account.export"), systemImage: "square.and.arrow.down")
                Spacer()
                if vm.isExporting { ProgressView() }
            }
        }
        .disabled(vm.isExporting)
        .sheet(item: $vm.exportFile, onDismiss: { vm.exportClosed() }) { file in
            ActivityView(items: [file.url])
                .presentationDetents([.medium, .large])
        }
    }

    private var deleteButton: some View {
        Button(role: .destructive) {
            showDelete = true
        } label: {
            Label(lang.t("account.delete"), systemImage: "trash")
                .foregroundColor(Brand.danger)
        }
        .sheet(isPresented: $showDelete) {
            DeleteAccountSheet()
                .environmentObject(lang)
                .environmentObject(session)
                .qabnahLocalized(lang)
        }
    }
}

@MainActor
final class DeleteAccountViewModel: ObservableObject {
    @Published var confirmText = ""
    @Published private(set) var isDeleting = false
    @Published private(set) var error: APIError?
    @Published private(set) var otherError: Error?

    var canDelete: Bool { AccountDeletionInput.isConfirmed(confirmText) && !isDeleting }

    /// True when the account is gone (204).
    func delete(api: APIClient) async -> Bool {
        guard AccountDeletionInput.isConfirmed(confirmText) else { return false }
        isDeleting = true
        defer { isDeleting = false }
        do {
            _ = try await api.send(Endpoints.deleteAccount())
            error = nil
            otherError = nil
            return true
        } catch let e as APIError {
            error = e
            otherError = nil
            return false
        } catch {
            otherError = error
            return false
        }
    }
}

/// Type DELETE to confirm, then `POST /me/delete`. A 409 (`account_deletion_blocked`: active
/// orders/deliveries or an unsettled balance) shows the server's reasons; success signs out.
struct DeleteAccountSheet: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @Environment(\.dismiss) var dismiss
    @StateObject private var vm = DeleteAccountViewModel()

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label(lang.t("account.delete_title"), systemImage: "exclamationmark.triangle.fill")
                        .font(.headline)
                        .foregroundColor(Brand.danger)
                    Text(lang.t("account.delete_message")).font(.subheadline)
                }
                Section {
                    TextField(AccountDeletionInput.confirmationWord, text: $vm.confirmText)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.body.monospaced())
                        .environment(\.layoutDirection, .leftToRight)
                        .accessibilityLabel(lang.t("account.delete_type_prompt"))
                } header: {
                    Text(lang.t("account.delete_type_prompt"))
                }
                errorSection
                Section {
                    Button(role: .destructive) {
                        Task { await submit() }
                    } label: {
                        if vm.isDeleting {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text(lang.t("account.delete_confirm")).frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(!vm.canDelete)
                }
            }
            .navigationTitle(lang.t("account.delete"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(lang.t("common.cancel")) { dismiss() }
                }
            }
            .interactiveDismissDisabled(vm.isDeleting)
        }
    }

    @ViewBuilder private var errorSection: some View {
        if let e = vm.error, e.isConflict {
            Section {
                Label(lang.t("account.delete_blocked"), systemImage: "hand.raised.fill")
                    .foregroundColor(Brand.danger)
                if let reasons = e.serverMessage, !reasons.isEmpty {
                    Text(reasons).font(.footnote).foregroundColor(.secondary)
                }
            }
        } else if let e = vm.error {
            Section { InlineError(error: e) }
        } else if let other = vm.otherError {
            Section { InlineError(error: other) }
        }
    }

    private func submit() async {
        guard await vm.delete(api: session.api) else { return }
        dismiss()
        await session.accountDeleted()
    }
}
