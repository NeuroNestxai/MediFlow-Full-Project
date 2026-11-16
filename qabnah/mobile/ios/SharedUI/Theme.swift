import SwiftUI

/// Brand tokens from `qabnah/brand/tokens.json`.
enum Brand {
    static let primary = Color(hex: "#0E7C66")!
    static let primaryDark = Color(hex: "#095C4C")!
    static let primaryLight = Color(hex: "#E3F3EF")!
    static let accent = Color(hex: "#F4A300")!
    static let ink = Color(hex: "#0B1F1C")!
    static let muted = Color(hex: "#5B6B68")!
    static let sand = Color(hex: "#FBF7EF")!
    static let border = Color(hex: "#E4E1D8")!
    static let danger = Color(hex: "#C2410C")!
    static let success = Color(hex: "#15803D")!
    static let info = Color(hex: "#1D4ED8")!

    static let radiusSm: CGFloat = 8
    static let radiusMd: CGFloat = 12
    static let radiusLg: CGFloat = 20
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

struct PrimaryButtonStyle: ButtonStyle {
    var color: Color = Brand.primary

    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        StyledLabel(configuration: configuration, color: color)
    }

    private struct StyledLabel: View {
        let configuration: ButtonStyleConfiguration
        let color: Color
        @Environment(\.isEnabled) var isEnabled

        var body: some View {
            configuration.label
                .font(.headline)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 50)
                .padding(.horizontal, 12)
                .background(color.opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.4))
                .foregroundColor(.white)
                .clipShape(RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous))
        }
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    var color: Color = Brand.primary

    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 46)
            .padding(.horizontal, 12)
            .foregroundColor(color)
            .background(color.opacity(configuration.isPressed ? 0.18 : 0.1))
            .clipShape(RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous))
    }
}

struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: Brand.radiusMd, style: .continuous))
    }
}

extension View {
    func card() -> some View { modifier(CardModifier()) }
}
