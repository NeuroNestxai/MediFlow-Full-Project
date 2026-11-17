import SwiftUI
import QabnahKit

// MARK: - Loading (skeleton shimmer — no spinners on full pages)

/// A moving highlight over `skeleton`; still when Reduce Motion is on.
struct QShimmer: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = -0.6

    var body: some View {
        GeometryReader { geo in
            QTheme.skeleton
                .overlay(alignment: .leading) {
                    Rectangle()
                        .fill(Color.white.opacity(0.28))
                        .frame(width: geo.size.width * 0.35)
                        .blur(radius: 18)
                        .offset(x: phase * geo.size.width)
                }
                .clipped()
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 1.3).repeatForever(autoreverses: false)) { phase = 1.3 }
        }
        .accessibilityHidden(true)
    }
}

/// One skeleton block (a line of text, a thumbnail, a cover).
struct QSkeleton: View {
    var width: CGFloat? = nil
    var height: CGFloat = 14
    var radius: CGFloat = 6

    var body: some View {
        QShimmer()
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// Skeleton of a list row: thumbnail + two lines.
struct QSkeletonRow: View {
    var body: some View {
        HStack(spacing: QTheme.space3) {
            QSkeleton(width: 56, height: 56, radius: QTheme.radiusSm)
            VStack(alignment: .leading, spacing: QTheme.space2) {
                QSkeleton(height: 14)
                QSkeleton(width: 140, height: 12)
            }
        }
        .padding(.vertical, QTheme.space2)
    }
}

/// Generic page / section placeholder while the primary data loads.
struct LoadingView: View {
    @EnvironmentObject var lang: LanguageSettings
    var rows = 4

    var body: some View {
        VStack(spacing: QTheme.space2) {
            ForEach(0..<rows, id: \.self) { _ in QSkeletonRow() }
        }
        .padding(QTheme.space4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(lang.t("common.loading"))
    }
}

// MARK: - Error / empty

/// Says what happened and offers the action that fixes it.
struct ErrorStateView: View {
    @EnvironmentObject var lang: LanguageSettings
    let error: Error
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: QTheme.space3) {
            Text(lang.errorMessage(error))
                .qFont(.body)
                .multilineTextAlignment(.center)
                .foregroundColor(QTheme.ink)
            if let retry {
                Button(lang.t("common.retry"), action: retry)
                    .buttonStyle(SecondaryButtonStyle(compact: true))
                    .frame(maxWidth: 220)
            }
        }
        .padding(QTheme.space6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// One line of plain text plus the action that fixes it; no illustration
/// (`systemImage` is kept for call-site compatibility and is not drawn).
struct EmptyStateView: View {
    let systemImage: String
    let title: String
    var message: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: QTheme.space2) {
            Text(title)
                .qFont(.h3)
                .foregroundColor(QTheme.ink)
                .multilineTextAlignment(.center)
            if let message {
                Text(message)
                    .qFont(.body)
                    .foregroundColor(QTheme.muted)
                    .multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(SecondaryButtonStyle(compact: true))
                    .frame(maxWidth: 240)
                    .padding(.top, QTheme.space2)
            }
        }
        .padding(QTheme.space8)
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
                .qFont(.small)
                .foregroundColor(QTheme.danger)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Status

/// Pill with a 6 pt dot. `solid` draws it on a white chip (for use on top of photos).
struct StatusPill: View {
    let text: String
    var color: Color = QTheme.tint
    var solid = false

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 6, height: 6).accessibilityHidden(true)
            Text(text).qFont(.small, .semibold)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .foregroundColor(solid ? QTheme.inkOnLight : color)
        .background(solid ? Color.white : color.opacity(0.14))
        .clipShape(Capsule())
    }
}

extension OrderStatus {
    var color: Color {
        switch self {
        case .pendingPayment: return QTheme.warning
        case .placed, .accepted, .preparing, .readyForPickup: return QTheme.info
        case .outForDelivery: return QTheme.tint
        case .delivered, .completed: return QTheme.success
        case .rejected, .cancelled: return QTheme.danger
        case .unknown: return QTheme.muted
        }
    }
}

// MARK: - Text rows

/// "label ........ value" row used in money breakdowns.
struct KeyValueRow: View {
    let label: String
    let value: String
    var bold = false
    var valueColor: Color = QTheme.ink

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).foregroundColor(bold ? QTheme.ink : QTheme.muted)
            Spacer(minLength: 12)
            Text(value).foregroundColor(valueColor).multilineTextAlignment(.trailing)
        }
        .qFont(bold ? QTextStyle.h3 : QTextStyle.body, tabular: true)
        .accessibilityElement(children: .combine)
    }
}

/// Section title above a group of cards.
struct QSectionTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .qFont(.h2)
            .foregroundColor(QTheme.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Price: amount in bold tabular numerals, currency label at 0.75× size, medium, muted.
struct QPrice: View {
    @EnvironmentObject var lang: LanguageSettings
    let baisa: Int
    var style: QTextStyle = .body
    var color: Color = QTheme.ink
    var currencyColor: Color = QTheme.muted

    var body: some View {
        let parts = Money.parts(baisa: baisa, language: lang.language)
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            if parts.currencyLeads { currency(parts.currency) }
            Text(verbatim: parts.amount)
                .qFont(style, .bold, tabular: true)
                .foregroundColor(color)
            if !parts.currencyLeads { currency(parts.currency) }
        }
        .lineLimit(1)
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(lang.money(baisa))
    }

    private func currency(_ text: String) -> some View {
        Text(verbatim: text)
            .qFont(size: style.size * 0.75, .medium, relativeTo: style.relativeTo)
            .foregroundColor(currencyColor)
    }
}

// MARK: - Controls

/// Large round icon button with a caption underneath (call / WhatsApp / navigate).
struct QIconAction: View {
    let systemImage: String
    let title: String
    var prominent = false

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(prominent ? QTheme.onCta : QTheme.ink)
                .frame(width: 60, height: 60)
                .background(prominent ? QTheme.cta : QTheme.surface)
                .clipShape(Circle())
                .overlay(Circle().stroke(prominent ? Color.clear : QTheme.line, lineWidth: 1))
                .accessibilityHidden(true)
            Text(title)
                .qFont(.small, .medium)
                .foregroundColor(QTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isButton)
    }
}

/// Quantity stepper: − n + with 36 pt round buttons. VoiceOver treats it as one adjustable control.
struct QStepper: View {
    @Binding var value: Int
    let range: ClosedRange<Int>
    /// Spoken label, e.g. "Quantity: 2".
    let label: String
    @EnvironmentObject var lang: LanguageSettings

    var body: some View {
        HStack(spacing: QTheme.space3) {
            button("minus", enabled: value > range.lowerBound) { value -= 1 }
            Text(lang.digits("\(value)"))
                .qFont(.h3, tabular: true)
                .foregroundColor(QTheme.ink)
                .frame(minWidth: 24)
            button("plus", enabled: value < range.upperBound) { value += 1 }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: if value < range.upperBound { value += 1 }
            case .decrement: if value > range.lowerBound { value -= 1 }
            default: break
            }
        }
    }

    private func button(_ systemImage: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(QTheme.ink)
                .frame(width: 36, height: 36)
                .background(QTheme.surface)
                .clipShape(Circle())
                .overlay(Circle().stroke(QTheme.line, lineWidth: 1))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
    }
}

/// Small circular button for toolbars that sit on top of photos (back, cart, close).
struct QCircleIcon: View {
    let systemImage: String
    var size: CGFloat = 36

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundColor(QTheme.inkOnLight)
            .frame(width: size, height: size)
            .background(Color.white)
            .clipShape(Circle())
            .qElevation1()
    }
}

/// Horizontal step indicator ("1 Address — 2 Payment — 3 Review"): completed steps in the tint
/// colour, the current step with a saffron dot and a soft halo, later steps muted.
struct QStepProgress: View {
    let titles: [String]
    /// Zero-based index of the current step; `titles.count` means everything is done.
    let current: Int

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(titles.enumerated()), id: \.offset) { index, title in
                step(index: index, title: title)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(titles.indices.contains(current) ? titles[current] : (titles.last ?? ""))
        .accessibilityValue("\(min(current + 1, titles.count))/\(titles.count)")
    }

    private func step(index: Int, title: String) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 0) {
                bar(visible: index > 0, filled: index <= current)
                dot(index: index)
                bar(visible: index < titles.count - 1, filled: index < current)
            }
            Text(title)
                .qFont(.micro, index == current ? QFontWeight.semibold : QFontWeight.medium)
                .foregroundColor(index <= current ? QTheme.ink : QTheme.muted)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .padding(.horizontal, 2)
        }
        .frame(maxWidth: .infinity)
    }

    private func bar(visible: Bool, filled: Bool) -> some View {
        Rectangle()
            .fill(visible ? (filled ? QTheme.tint : QTheme.line) : Color.clear)
            .frame(height: 2)
            .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func dot(index: Int) -> some View {
        if index == current {
            Circle()
                .fill(QTheme.saffron)
                .frame(width: 12, height: 12)
                .background(Circle().fill(QTheme.saffron.opacity(0.25)).frame(width: 22, height: 22))
                .frame(width: 22, height: 22)
        } else if index < current {
            Circle().fill(QTheme.tint).frame(width: 12, height: 12).frame(width: 22, height: 22)
        } else {
            Circle().stroke(QTheme.line, lineWidth: 2).frame(width: 12, height: 12).frame(width: 22, height: 22)
        }
    }
}

/// Full-width sticky CTA bar: night background, safe-area padding. Its content is laid out on a
/// night surface (dark scheme), so `PrimaryButtonStyle()` inside it is saffron with ink text.
struct QNightBar<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: QTheme.space2) {
            content()
        }
        .padding(.horizontal, QTheme.space4)
        .padding(.top, QTheme.space3)
        .padding(.bottom, QTheme.space2)
        .frame(maxWidth: .infinity)
        .background(QTheme.night.ignoresSafeArea(edges: .bottom))
        .environment(\.colorScheme, .dark)
    }
}

/// Rectangle with only the top corners rounded (bottom panels that overlap a map or photo).
struct QTopRoundedShape: Shape {
    var radius: CGFloat

    func path(in rect: CGRect) -> Path {
        let r = min(radius, rect.width / 2, rect.height / 2)
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        path.addArc(center: CGPoint(x: rect.minX + r, y: rect.minY + r), radius: r,
                    startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
        path.addArc(center: CGPoint(x: rect.maxX - r, y: rect.minY + r), radius: r,
                    startAngle: .degrees(270), endAngle: .degrees(0), clockwise: false)
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

/// Input container: radius 10, 1 px line, surface fill.
struct QFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .qFont(.body)
            .padding(.horizontal, QTheme.space3)
            .frame(minHeight: QTheme.buttonHeight)
            .background(QTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusSm, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: QTheme.radiusSm, style: .continuous).stroke(QTheme.line, lineWidth: 1))
    }
}

/// Selectable row with a radio / check mark on the leading edge (addresses, payment methods, options).
struct QChoiceRow<Content: View>: View {
    let selected: Bool
    var multiple = false
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack(alignment: .center, spacing: QTheme.space3) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(selected ? QTheme.tint : QTheme.muted)
                .accessibilityHidden(true)
            content()
            Spacer(minLength: 0)
        }
        .padding(QTheme.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(selected ? QTheme.primarySoft : QTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusSm, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: QTheme.radiusSm, style: .continuous)
            .stroke(selected ? QTheme.tint : QTheme.line, lineWidth: selected ? 1.5 : 1))
        .contentShape(Rectangle())
    }

    private var icon: String {
        if multiple { return selected ? "checkmark.square.fill" : "square" }
        return selected ? "largecircle.fill.circle" : "circle"
    }
}

/// Sheet chrome: drag indicator, radius 24 and the page background (the last two need iOS 16.4).
struct QSheetStyle: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 16.4, *) {
            content
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(QTheme.radiusLg)
                .presentationBackground(QTheme.background)
        } else {
            content.presentationDragIndicator(.visible)
        }
    }
}

extension View {
    func qField() -> some View { modifier(QFieldStyle()) }
    func qSheet() -> some View { modifier(QSheetStyle()) }
}

// MARK: - Forms and lists

/// `Form` on the page background with surface-coloured rows (white on sand, night-2 on night).
struct QForm<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        Form {
            Group { content() }.listRowBackground(QTheme.surface)
        }
        .qScreen()
    }
}

/// `List` on the page background with surface-coloured rows.
struct QList<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        List {
            Group { content() }.listRowBackground(QTheme.surface)
        }
        .qScreen()
    }
}

// MARK: - Misc

/// Shown only when a development server echoes the OTP (`devCode`).
struct DevCodeBanner: View {
    @EnvironmentObject var lang: LanguageSettings
    let code: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wrench.and.screwdriver").accessibilityHidden(true)
            Text(lang.t("auth.dev_code"))
            // Its own element so UI tests can read the code: identifier "auth.devCode".
            Text(verbatim: code)
                .qFont(.body, .bold, tabular: true)
                .accessibilityLabel(code)
                .accessibilityIdentifier("auth.devCode")
            Spacer()
        }
        .qFont(.small)
        .foregroundColor(QTheme.ink)
        .padding(10)
        .background(QTheme.saffronSoft)
        .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusSm, style: .continuous))
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
            Text(label).qFont(.small, .medium).foregroundColor(QTheme.muted)
            TextField(label, text: $text, axis: axis)
                .keyboardType(keyboard)
                .textContentType(contentType)
                .lineLimit(axis == .vertical ? 4 : 1)
        }
        .padding(.vertical, 2)
    }
}

extension View {
    /// Applies the in-app language to a view tree: strings' layout direction and locale, and the
    /// matching IBM Plex face as the default (body) font.
    func qabnahLocalized(_ lang: LanguageSettings) -> some View {
        self
            .font(QFonts.font(.body, arabic: lang.language == .ar))
            .environment(\.layoutDirection, lang.layoutDirection)
            .environment(\.locale, lang.locale)
    }
}
