import SwiftUI
import UIKit

// Design System v2 "Night & Sand" (`qabnah/docs/DESIGN_SYSTEM.md`).
//
// The consumer app runs in the light scheme (sand pages, white cards); the captain app runs in the
// dark scheme, which is the "night" surface of the design system. The semantic tokens below
// (`background`, `surface`, `ink`, `muted`, `line`, `cta`…) resolve per scheme, so shared screens
// look right in both apps without branching.

extension UIColor {
    convenience init(qHex hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: alpha)
    }

    /// One value on light (sand) surfaces, another on night surfaces.
    static func qDynamic(light: UInt32, night: UInt32) -> UIColor {
        UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(qHex: night) : UIColor(qHex: light)
        }
    }
}

enum QTheme {
    // MARK: Fixed brand colours

    static let night = Color(UIColor(qHex: 0x061A16))
    static let night2 = Color(UIColor(qHex: 0x0B2A25))
    static let nightLine = Color(UIColor(qHex: 0x1B3F38))
    static let primary = Color(UIColor(qHex: 0x0E7C66))
    static let primaryDeep = Color(UIColor(qHex: 0x095C4C))
    static let saffron = Color(UIColor(qHex: 0xF4A300))
    static let sand = Color(UIColor(qHex: 0xFAF6EE))
    /// Text on light surfaces (also the text colour on saffron).
    static let inkOnLight = Color(UIColor(qHex: 0x0B1F1C))
    /// Text on night surfaces.
    static let onNight = Color(UIColor(qHex: 0xF3F7F5))
    static let onNightMuted = Color(UIColor(qHex: 0xA9BDB8))

    // MARK: Semantic colours (light / night)

    /// Page background: sand / night.
    static let background = Color(QUIColor.background)
    /// Cards and raised surfaces: white / night-2.
    static let surface = Color(QUIColor.surface)
    static let ink = Color(QUIColor.ink)
    static let muted = Color(QUIColor.muted)
    /// Hairlines: line / night-line.
    static let line = Color(QUIColor.line)
    /// Links, selected states, active icons: primary / saffron (primary is too dark on night).
    static let tint = Color(QUIColor.tint)
    /// Fill of the primary action: primary / saffron.
    static let cta = Color(QUIColor.tint)
    /// Text on `cta`: white / ink.
    static let onCta = Color(UIColor.qDynamic(light: 0xFFFFFF, night: 0x0B1F1C))
    static let primarySoft = Color(UIColor.qDynamic(light: 0xE3F3EF, night: 0x10382F))
    static let saffronSoft = Color(UIColor.qDynamic(light: 0xFEF3D6, night: 0x3B2E0B))
    /// Skeleton blocks.
    static let skeleton = Color(UIColor.qDynamic(light: 0xEFE9DC, night: 0x12352F))
    /// Card outline: none on light (elevation carries it), night-line on night.
    static let cardStroke = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark ? UIColor(qHex: 0x1B3F38) : UIColor.clear
    })

    // Status — never decoration. Lighter tints on night for contrast.
    static let success = Color(UIColor.qDynamic(light: 0x15803D, night: 0x4FC47E))
    static let warning = Color(UIColor.qDynamic(light: 0xB45309, night: 0xF2A65A))
    static let danger = Color(UIColor.qDynamic(light: 0xC2410C, night: 0xF08A5D))
    static let info = Color(UIColor.qDynamic(light: 0x1D4ED8, night: 0x8FB0FF))

    // MARK: Shape & spacing

    /// Inputs, chips.
    static let radiusSm: CGFloat = 10
    /// Buttons.
    static let radiusButton: CGFloat = 12
    /// Cards, images.
    static let radiusMd: CGFloat = 16
    /// Sheets, hero media.
    static let radiusLg: CGFloat = 24

    static let space1: CGFloat = 4
    static let space2: CGFloat = 8
    static let space3: CGFloat = 12
    static let space4: CGFloat = 16
    static let space5: CGFloat = 20
    static let space6: CGFloat = 24
    static let space8: CGFloat = 32

    static let buttonHeight: CGFloat = 48
    static let buttonHeightCompact: CGFloat = 44
}

/// UIKit versions of the semantic colours (bar appearances, map overlays).
enum QUIColor {
    static let background = UIColor.qDynamic(light: 0xFAF6EE, night: 0x061A16)
    static let surface = UIColor.qDynamic(light: 0xFFFFFF, night: 0x0B2A25)
    static let ink = UIColor.qDynamic(light: 0x0B1F1C, night: 0xF3F7F5)
    static let muted = UIColor.qDynamic(light: 0x5B6B68, night: 0xA9BDB8)
    static let line = UIColor.qDynamic(light: 0xE8E3D8, night: 0x1B3F38)
    static let tint = UIColor.qDynamic(light: 0x0E7C66, night: 0xF4A300)
    static let primary = UIColor(qHex: 0x0E7C66)
    static let saffron = UIColor(qHex: 0xF4A300)
    static let night = UIColor(qHex: 0x061A16)
    static let inkOnLight = UIColor(qHex: 0x0B1F1C)
}

/// Names used before Design System v2; kept so older call sites read the new tokens.
enum Brand {
    static let primary = QTheme.tint
    static let primaryDark = QTheme.primaryDeep
    static let primaryLight = QTheme.primarySoft
    static let accent = QTheme.saffron
    static let ink = QTheme.ink
    static let muted = QTheme.muted
    static let sand = QTheme.background
    static let border = QTheme.line
    static let danger = QTheme.danger
    static let success = QTheme.success
    static let info = QTheme.info

    static let radiusSm = QTheme.radiusSm
    static let radiusMd = QTheme.radiusMd
    static let radiusLg = QTheme.radiusLg
}

extension Color {
    /// `#RRGGBB` or `#RRGGBBAA` (merchant `brandColor` / `accentColor`).
    init?(hex: String?) {
        guard var s = hex?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6 || s.count == 8, let v = UInt64(s, radix: 16) else { return nil }
        let r, g, b, a: Double
        if s.count == 6 {
            r = Double((v >> 16) & 0xFF) / 255
            g = Double((v >> 8) & 0xFF) / 255
            b = Double(v & 0xFF) / 255
            a = 1
        } else {
            r = Double((v >> 24) & 0xFF) / 255
            g = Double((v >> 16) & 0xFF) / 255
            b = Double((v >> 8) & 0xFF) / 255
            a = Double(v & 0xFF) / 255
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}

// MARK: - Elevation

/// Elevation 1 (cards): `0 1px 2px rgba(11,31,28,.05), 0 6px 16px rgba(11,31,28,.06)`.
/// Elevation 2 (floating bars, sheets): `0 2px 6px rgba(11,31,28,.08), 0 18px 48px rgba(11,31,28,.16)`.
struct QElevation: ViewModifier {
    let level: Int

    private var shadow: Color { QTheme.inkOnLight }

    func body(content: Content) -> some View {
        if level >= 2 {
            content
                .shadow(color: shadow.opacity(0.08), radius: 3, x: 0, y: 2)
                .shadow(color: shadow.opacity(0.16), radius: 24, x: 0, y: 18)
        } else {
            content
                .shadow(color: shadow.opacity(0.05), radius: 1, x: 0, y: 1)
                .shadow(color: shadow.opacity(0.06), radius: 8, x: 0, y: 6)
        }
    }
}

/// Card: surface, radius 16, elevation 1, 16 pt padding, no border (a night-line outline on night).
struct CardModifier: ViewModifier {
    var padding: CGFloat = QTheme.space4

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(QTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous).stroke(QTheme.cardStroke, lineWidth: 1))
            .modifier(QElevation(level: 1))
    }
}

extension View {
    func qElevation1() -> some View { modifier(QElevation(level: 1)) }
    func qElevation2() -> some View { modifier(QElevation(level: 2)) }

    func card() -> some View { modifier(CardModifier()) }
    /// Card chrome without inner padding (photo-led cards).
    func cardChrome() -> some View { modifier(CardModifier(padding: 0)) }

    /// Page background for scroll views, lists and forms: sand / night instead of system grouped grey.
    func qScreen() -> some View {
        self
            .scrollContentBackground(.hidden)
            .background(QTheme.background.ignoresSafeArea())
    }
}

// MARK: - Buttons

/// Primary: `primary` fill with white text; on night surfaces saffron fill with ink text.
/// Radius 12, height 48 (44 compact). Pass `color` for a merchant's brand colour (white text).
struct PrimaryButtonStyle: ButtonStyle {
    var color: Color? = nil
    var compact = false

    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        QFilledButtonLabel(configuration: configuration, fill: color ?? QTheme.cta,
                           foreground: color == nil ? QTheme.onCta : Color.white, compact: compact)
    }
}

/// Saffron fill with ink text: the primary action on a night surface (sticky CTA bars, cart bar).
struct SaffronButtonStyle: ButtonStyle {
    var compact = false

    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        QFilledButtonLabel(configuration: configuration, fill: QTheme.saffron,
                           foreground: QTheme.inkOnLight, compact: compact)
    }
}

struct QFilledButtonLabel: View {
    let configuration: ButtonStyleConfiguration
    let fill: Color
    let foreground: Color
    let compact: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .qFont(.h3)
            .multilineTextAlignment(.center)
            .foregroundColor(foreground)
            .frame(maxWidth: .infinity, minHeight: compact ? QTheme.buttonHeightCompact : QTheme.buttonHeight)
            .padding(.horizontal, QTheme.space4)
            .background(fill)
            .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusButton, style: .continuous))
            .opacity(isEnabled ? (configuration.isPressed ? 0.85 : 1) : 0.45)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// Secondary: surface fill, 1 px line, ink text (`color` tints the text, e.g. a destructive choice).
struct SecondaryButtonStyle: ButtonStyle {
    var color: Color? = nil
    var compact = false

    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        QOutlinedButtonLabel(configuration: configuration, foreground: color ?? QTheme.ink, compact: compact)
    }
}

struct QOutlinedButtonLabel: View {
    let configuration: ButtonStyleConfiguration
    let foreground: Color
    let compact: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .qFont(.h3)
            .multilineTextAlignment(.center)
            .foregroundColor(foreground)
            .frame(maxWidth: .infinity, minHeight: compact ? QTheme.buttonHeightCompact : QTheme.buttonHeight)
            .padding(.horizontal, QTheme.space4)
            .background(QTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusButton, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: QTheme.radiusButton, style: .continuous).stroke(QTheme.line, lineWidth: 1))
            .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.45)
    }
}

/// Destructive: danger text, no fill (fills only in confirmation dialogs).
struct DestructiveButtonStyle: ButtonStyle {
    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        configuration.label
            .qFont(.h3)
            .foregroundColor(QTheme.danger)
            .frame(maxWidth: .infinity, minHeight: QTheme.buttonHeightCompact)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

/// Tertiary: text only, in the tint colour.
struct TertiaryButtonStyle: ButtonStyle {
    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        configuration.label
            .qFont(.body, .semibold)
            .foregroundColor(QTheme.tint)
            .frame(minHeight: QTheme.buttonHeightCompact)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}
