import SwiftUI
import QabnahKit

/// Checklist from `GET /captain/profile` (`requiredDocuments`, `missingDocuments`, each document's
/// status / rejectionReason). Tapping a row opens the upload sheet.
struct DocumentsView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var store: CaptainStore
    @State private var uploading: CaptainDocType? = nil

    var body: some View {
        Group {
            if let p = store.profile {
                List {
                    Section {
                        Text(lang.t("documents.intro")).font(.subheadline).foregroundColor(.secondary)
                    }
                    Section {
                        ForEach(p.documentChecklist) { row in
                            Button { uploading = row.type } label: {
                                DocumentRow(type: row.type, document: row.document, missing: row.missing)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    let extra = p.documents.filter { !p.requiredDocuments.contains($0.docType) && $0.docType != .unknown }
                    if !extra.isEmpty {
                        Section(lang.t("documents.other")) {
                            ForEach(extra) { d in DocumentRow(type: d.docType, document: d, missing: false) }
                        }
                    }
                }
                .refreshable { await store.refreshProfile() }
            } else {
                LoadableView(state: store.profileState, retry: { Task { await store.refreshProfile() } }) { _ in EmptyView() }
            }
        }
        .navigationTitle(lang.t("onboarding.documents"))
        .sheet(item: $uploading) { type in
            DocumentUploadView(api: session.api, docType: type, existing: store.profile?.document(for: type)) {
                Task { await store.refreshProfile() }
            }
        }
        .task { await store.refreshProfile() }
    }
}

extension CaptainDocType: Identifiable {
    public var id: String { rawValue }
}

struct DocumentRow: View {
    @EnvironmentObject var lang: LanguageSettings
    let type: CaptainDocType
    let document: CaptainDocument?
    let missing: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundColor(color).font(.title3).frame(width: 28).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(lang.t("doc.\(type.rawValue)")).font(.headline)
                Text(statusText).font(.caption).foregroundColor(color)
                if document?.status == .rejected, let reason = document?.rejectionReason {
                    Text(reason).font(.caption).foregroundColor(Brand.danger)
                }
                if let exp = document?.expiresAt {
                    Text(lang.f("documents.expires", lang.digits(exp))).font(.caption2).foregroundColor(.secondary)
                }
            }
            Spacer()
            Image(systemName: "chevron.forward").font(.caption).foregroundColor(.secondary).accessibilityHidden(true)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private var statusText: String {
        if missing || document == nil { return lang.t("documents.status.missing") }
        return lang.t("documents.status.\(document!.status.rawValue)")
    }

    private var icon: String {
        if missing || document == nil { return "doc.badge.plus" }
        switch document!.status {
        case .approved: return "checkmark.seal.fill"
        case .rejected: return "xmark.octagon.fill"
        default: return "hourglass"
        }
    }

    private var color: Color {
        if missing || document == nil { return Brand.info }
        switch document!.status {
        case .approved: return Brand.success
        case .rejected: return Brand.danger
        default: return Brand.accent
        }
    }
}

@MainActor
final class DocumentUploadViewModel: ObservableObject {
    @Published var image: UIImage?
    @Published var number = ""
    @Published var hasExpiry = false
    @Published var expiry = Calendar.current.date(byAdding: .year, value: 1, to: Date()) ?? Date()
    @Published private(set) var isUploading = false
    @Published var error: Error?

    let docType: CaptainDocType
    private let api: APIClient

    init(api: APIClient, docType: CaptainDocType, existing: CaptainDocument?) {
        self.api = api
        self.docType = docType
        number = existing?.number ?? ""
        if let e = existing?.expiresAt.flatMap(MuscatCalendar.date(fromDay:)) {
            hasExpiry = true
            expiry = e
        } else {
            hasExpiry = docType != .profilePhoto
        }
    }

    var asksForNumber: Bool { docType != .profilePhoto }
    var canUpload: Bool { image != nil && !isUploading }

    /// `POST /files` (purpose `captain_document`) then `POST /captain/documents`.
    func upload() async -> Bool {
        guard let image, let data = image.uploadJPEG() else { return false }
        isUploading = true
        defer { isUploading = false }
        do {
            let file = try await api.uploadFile(data: data, fileName: "\(docType.rawValue).jpg", mimeType: "image/jpeg",
                                                purpose: .captainDocument)
            _ = try await api.send(Endpoints.addCaptainDocument(CaptainDocumentInput(
                docType: docType, fileId: file.id,
                number: asksForNumber ? Digits.ascii(number).trimmingCharacters(in: .whitespaces) : nil,
                expiresAt: hasExpiry ? MuscatCalendar.dayString(expiry) : nil)))
            error = nil
            return true
        } catch {
            self.error = error
            return false
        }
    }
}

struct DocumentUploadView: View {
    @EnvironmentObject var lang: LanguageSettings
    @Environment(\.dismiss) var dismiss
    @StateObject private var vm: DocumentUploadViewModel
    private let existing: CaptainDocument?
    let onUploaded: () -> Void

    init(api: APIClient, docType: CaptainDocType, existing: CaptainDocument?, onUploaded: @escaping () -> Void) {
        _vm = StateObject(wrappedValue: DocumentUploadViewModel(api: api, docType: docType, existing: existing))
        self.existing = existing
        self.onUploaded = onUploaded
    }

    var body: some View {
        NavigationStack {
            Form {
                if let existing {
                    Section(lang.t("documents.current")) {
                        DocumentRow(type: existing.docType, document: existing, missing: false)
                        if existing.fileUrl != nil {
                            RemoteImage(urlString: existing.fileUrl, contentMode: .fit, placeholderIcon: "doc")
                                .frame(height: 160)
                        }
                    }
                }
                Section {
                    PhotoInput(image: $vm.image)
                } header: {
                    Text(lang.t("documents.photo"))
                } footer: {
                    Text(lang.t("documents.photo_hint"))
                }
                if vm.asksForNumber {
                    Section(lang.t("documents.details")) {
                        TextField(lang.t("documents.number"), text: $vm.number)
                        Toggle(lang.t("documents.has_expiry"), isOn: $vm.hasExpiry)
                        if vm.hasExpiry {
                            DatePicker(lang.t("documents.expiry"), selection: $vm.expiry, in: Date()..., displayedComponents: .date)
                        }
                    }
                }
                if vm.error != nil { Section { InlineError(error: vm.error) } }
            }
            .safeAreaInset(edge: .bottom) {
                Button {
                    Task {
                        if await vm.upload() {
                            onUploaded()
                            dismiss()
                        }
                    }
                } label: {
                    if vm.isUploading { ProgressView().tint(.white) } else { Text(lang.t("documents.upload")) }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!vm.canUpload)
                .padding()
                .background(.bar)
            }
            .navigationTitle(lang.t("doc.\(vm.docType.rawValue)"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(lang.t("common.cancel")) { dismiss() } }
            }
            .interactiveDismissDisabled(vm.isUploading)
        }
    }
}
