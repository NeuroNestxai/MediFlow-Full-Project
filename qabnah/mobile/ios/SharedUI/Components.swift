import SwiftUI
import QabnahKit

struct LoadingView: View {
    @EnvironmentObject var lang: LanguageSettings

    var body: some View {
        ProgressView()
            .controlSize(.large)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding()
            .accessibilityLabel(lang.t("common.loading"))
    }
}

struct ErrorStateView: View {
    @EnvironmentObject var lang: LanguageSettings
    let error: Error
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundColor(Brand.danger)
                .accessibilityHidden(true)
            Text(lang.errorMessage(error))
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
            if let retry {
                Button(lang.t("common.retry"), action: retry)
                    .buttonStyle(SecondaryButtonStyle())
                    .frame(maxWidth: 220)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct EmptyStateView: View {
    let systemImage: String
    let title: String
    var message: String?

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 44))
                .foregroundColor(Brand.primary.opacity(0.6))
                .accessibilityHidden(true)
            Text(title).font(.headline).multilineTextAlignment(.center)
            if let message {
                Text(message).font(.subheadline).foregroundColor(.secondary).multilineTextAlignment(.center)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Switches over a `Loadable` and renders loading / error / content.
struct LoadableView<Value, Content: View>: View {
    let state: Loadable<Value>
    let retry: () -> Void
    @ViewBuilder let content: (Value) -> Content

    var body: some View {
        switch state {
        case .idle, .loading:
            LoadingView()
        case .failed(let error):
            ErrorStateView(error: error, retry: retry)
        case .loaded(let value):
            content(value)
        }
    }
}

struct InlineError: View {
    @EnvironmentObject var lang: LanguageSettings
    let error: Error?

    var body: some View {
        if let error {
            Label(lang.errorMessage(error), systemImage: "exclamationmark.circle")
                .font(.footnote)
                .foregroundColor(Brand.danger)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Image from the API (absolute or server-relative URL).
struct RemoteImage: View {
    @EnvironmentObject var session: SessionStore
    let urlString: String?
    var contentMode: ContentMode = .fill
    var placeholderIcon: String = "photo"

    var body: some View {
        if let url = session.api.config.resolve(urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: contentMode)
                case .failure:
                    placeholder
                default:
                    placeholder.overlay(ProgressView())
                }
            }
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        ZStack {
            Color(.tertiarySystemFill)
            Image(systemName: placeholderIcon).foregroundColor(.secondary)
        }
        .accessibilityHidden(true)
    }
}

struct StatusPill: View {
    let text: String
    var color: Color = Brand.primary

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .foregroundColor(color)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
    }
}

/// "label ........ value" row used in money breakdowns.
struct KeyValueRow: View {
    let label: String
    let value: String
    var bold = false
    var valueColor: Color = .primary

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).foregroundColor(bold ? .primary : .secondary)
            Spacer(minLength: 12)
            Text(value).foregroundColor(valueColor).multilineTextAlignment(.trailing)
        }
        .font(bold ? .headline : .body)
        .accessibilityElement(children: .combine)
    }
}

/// Shown only when a development server echoes the OTP (`devCode`).
struct DevCodeBanner: View {
    @EnvironmentObject var lang: LanguageSettings
    let code: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "ladybug").accessibilityHidden(true)
            Text(lang.t("auth.dev_code"))
            Text(verbatim: code).font(.body.monospacedDigit().bold())
            Spacer()
        }
        .font(.footnote)
        .padding(10)
        .background(Color.yellow.opacity(0.25))
        .clipShape(RoundedRectangle(cornerRadius: Brand.radiusSm))
        .accessibilityElement(children: .combine)
    }
}

struct LanguagePicker: View {
    @EnvironmentObject var lang: LanguageSettings

    var body: some View {
        Picker(lang.t("account.language"), selection: $lang.language) {
            ForEach(AppLanguage.allCases) { l in
                Text(verbatim: l.endonym).tag(l)
            }
        }
        .pickerStyle(.segmented)
        .accessibilityLabel(lang.t("account.language"))
    }
}

/// Text field row with a leading label (forms).
struct LabeledField: View {
    let label: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var contentType: UITextContentType?
    var axis: Axis = .horizontal

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundColor(.secondary)
            TextField(label, text: $text, axis: axis)
                .keyboardType(keyboard)
                .textContentType(contentType)
                .lineLimit(axis == .vertical ? 4 : 1)
        }
        .padding(.vertical, 2)
    }
}

extension View {
    /// Applies the in-app language (strings, layout direction, locale) to a view tree.
    func qabnahLocalized(_ lang: LanguageSettings) -> some View {
        self
            .environment(\.layoutDirection, lang.layoutDirection)
            .environment(\.locale, lang.locale)
    }
}

extension OrderStatus {
    var color: Color {
        switch self {
        case .pendingPayment: return Brand.accent
        case .placed, .accepted, .preparing, .readyForPickup: return Brand.info
        case .outForDelivery: return Brand.primary
        case .delivered, .completed: return Brand.success
        case .rejected, .cancelled: return Brand.danger
        case .unknown: return .secondary
        }
    }
}
