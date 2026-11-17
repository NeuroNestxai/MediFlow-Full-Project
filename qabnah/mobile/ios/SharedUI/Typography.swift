import SwiftUI
import UIKit
import CoreText
import QabnahKit

/// The two weights-per-component rule is the designer's; the fonts ship four: 400/500/600/700.
enum QFontWeight {
    case regular, medium, semibold, bold

    var system: Font.Weight {
        switch self {
        case .regular: return .regular
        case .medium: return .medium
        case .semibold: return .semibold
        case .bold: return .bold
        }
    }

    var uiKit: UIFont.Weight {
        switch self {
        case .regular: return .regular
        case .medium: return .medium
        case .semibold: return .semibold
        case .bold: return .bold
        }
    }
}

/// Type scale (pt): display 44 · h1 30 · h2 22 · h3 17 · body 15 · small 13 · micro 11.
/// Sizes scale with Dynamic Type relative to the nearest system text style.
enum QTextStyle {
    case display, h1, h2, h3, body, small, micro

    var size: CGFloat {
        switch self {
        case .display: return 44
        case .h1: return 30
        case .h2: return 22
        case .h3: return 17
        case .body: return 15
        case .small: return 13
        case .micro: return 11
        }
    }

    var weight: QFontWeight {
        switch self {
        case .display, .h1, .h2: return .bold
        case .h3: return .semibold
        case .body, .small: return .regular
        case .micro: return .medium
        }
    }

    var relativeTo: Font.TextStyle {
        switch self {
        case .display: return .largeTitle
        case .h1: return .title
        case .h2: return .title2
        case .h3: return .headline
        case .body: return .body
        case .small: return .footnote
        case .micro: return .caption2
        }
    }

    var uiTextStyle: UIFont.TextStyle {
        switch self {
        case .display: return .largeTitle
        case .h1: return .title1
        case .h2: return .title2
        case .h3: return .headline
        case .body: return .body
        case .small: return .footnote
        case .micro: return .caption2
        }
    }
}

/// IBM Plex Sans Arabic (Arabic UI) and IBM Plex Sans (English UI), bundled from `Fonts/` and
/// listed under `UIAppFonts`. If a face is missing the system font is used instead.
enum QFonts {
    static let files = [
        "IBMPlexSansArabic-Regular", "IBMPlexSansArabic-Medium", "IBMPlexSansArabic-SemiBold", "IBMPlexSansArabic-Bold",
        "IBMPlexSans-Regular", "IBMPlexSans-Medium", "IBMPlexSans-SemiBold", "IBMPlexSans-Bold",
    ]

    /// PostScript names (read from the font files' name tables).
    static func postScriptName(_ weight: QFontWeight, arabic: Bool) -> String {
        if arabic {
            switch weight {
            case .regular: return "IBMPlexSansArabic-Regular"
            case .medium: return "IBMPlexSansArabic-Medium"
            case .semibold: return "IBMPlexSansArabic-SemiBold"
            case .bold: return "IBMPlexSansArabic-Bold"
            }
        }
        switch weight {
        case .regular: return "IBMPlexSans"
        case .medium: return "IBMPlexSans-Medm"
        case .semibold: return "IBMPlexSans-SmBld"
        case .bold: return "IBMPlexSans-Bold"
        }
    }

    /// True when every weight of the family resolves. Registers the bundled files first in case
    /// `UIAppFonts` did not (registration errors, e.g. "already registered", are ignored).
    static let arabicAvailable: Bool = familyAvailable(arabic: true)
    static let latinAvailable: Bool = familyAvailable(arabic: false)

    private static let registered: Bool = {
        for file in files where UIFont(name: file, size: 12) == nil {
            if let url = Bundle.main.url(forResource: file, withExtension: "ttf") {
                _ = CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
        return true
    }()

    private static func familyAvailable(arabic: Bool) -> Bool {
        _ = registered
        let weights: [QFontWeight] = [.regular, .medium, .semibold, .bold]
        for weight in weights where UIFont(name: postScriptName(weight, arabic: arabic), size: 12) == nil {
            return false
        }
        return true
    }

    static func isAvailable(arabic: Bool) -> Bool { arabic ? arabicAvailable : latinAvailable }

    static func font(size: CGFloat, weight: QFontWeight, arabic: Bool, relativeTo: Font.TextStyle) -> Font {
        if isAvailable(arabic: arabic) {
            return Font.custom(postScriptName(weight, arabic: arabic), size: size, relativeTo: relativeTo)
        }
        return Font.system(size: size, weight: weight.system)
    }

    static func font(_ style: QTextStyle, weight: QFontWeight? = nil, arabic: Bool) -> Font {
        font(size: style.size, weight: weight ?? style.weight, arabic: arabic, relativeTo: style.relativeTo)
    }

    /// UIKit font (navigation bars, tab bars, segmented controls), scaled for Dynamic Type.
    static func uiFont(_ style: QTextStyle, weight: QFontWeight? = nil, arabic: Bool) -> UIFont {
        let w = weight ?? style.weight
        let base: UIFont
        if isAvailable(arabic: arabic), let custom = UIFont(name: postScriptName(w, arabic: arabic), size: style.size) {
            base = custom
        } else {
            base = UIFont.systemFont(ofSize: style.size, weight: w.uiKit)
        }
        return UIFontMetrics(forTextStyle: style.uiTextStyle).scaledFont(for: base)
    }
}

/// Picks the Arabic or Latin face from the view's locale (set by `qabnahLocalized`).
struct QFontModifier: ViewModifier {
    @Environment(\.locale) private var locale
    let size: CGFloat
    let weight: QFontWeight
    let relativeTo: Font.TextStyle
    let tabular: Bool

    func body(content: Content) -> some View {
        content.font(resolved)
    }

    private var resolved: Font {
        let arabic = locale.identifier.hasPrefix("ar")
        let font = QFonts.font(size: size, weight: weight, arabic: arabic, relativeTo: relativeTo)
        return tabular ? font.monospacedDigit() : font
    }
}

extension View {
    /// Design-system text style. `tabular` uses fixed-width digits (prices, timers, counters).
    func qFont(_ style: QTextStyle, _ weight: QFontWeight? = nil, tabular: Bool = false) -> some View {
        modifier(QFontModifier(size: style.size, weight: weight ?? style.weight, relativeTo: style.relativeTo,
                               tabular: tabular))
    }

    /// Off-scale size (big figures such as the delivery PIN or the earning on an offer).
    func qFont(size: CGFloat, _ weight: QFontWeight = .bold, relativeTo: Font.TextStyle = .title,
               tabular: Bool = false) -> some View {
        modifier(QFontModifier(size: size, weight: weight, relativeTo: relativeTo, tabular: tabular))
    }
}

/// UIKit chrome (navigation bar, tab bar, segmented control, page dots) in the design system's
/// colours and fonts. Called at launch and again when the language changes.
enum QAppearance {
    @MainActor
    static func apply(language: AppLanguage, showsTabSelectionDot: Bool) {
        // IBM Plex Sans Arabic carries the Plex Sans Latin glyphs too, so using it for the bars keeps
        // titles correct in both languages even for bars created before a language switch.
        let arabic = QFonts.arabicAvailable || language == .ar

        let nav = UINavigationBarAppearance()
        nav.configureWithOpaqueBackground()
        nav.backgroundColor = QUIColor.background
        nav.shadowColor = .clear
        nav.titleTextAttributes = [
            .font: QFonts.uiFont(.h3, arabic: arabic),
            .foregroundColor: QUIColor.ink,
        ]
        nav.largeTitleTextAttributes = [
            .font: QFonts.uiFont(.h1, arabic: arabic),
            .foregroundColor: QUIColor.ink,
        ]
        let barButton = UIBarButtonItemAppearance()
        barButton.normal.titleTextAttributes = [.font: QFonts.uiFont(.body, weight: .medium, arabic: arabic)]
        nav.buttonAppearance = barButton
        nav.doneButtonAppearance = barButton
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().tintColor = QUIColor.tint

        let tab = UITabBarAppearance()
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = QUIColor.surface
        tab.shadowColor = QUIColor.line
        if showsTabSelectionDot {
            tab.selectionIndicatorImage = selectionDot()
        }
        let items = [tab.stackedLayoutAppearance, tab.inlineLayoutAppearance, tab.compactInlineLayoutAppearance]
        for item in items {
            item.normal.iconColor = QUIColor.muted
            item.normal.titleTextAttributes = [
                .font: QFonts.uiFont(.micro, arabic: arabic),
                .foregroundColor: QUIColor.muted,
            ]
            item.selected.iconColor = QUIColor.tint
            item.selected.titleTextAttributes = [
                .font: QFonts.uiFont(.micro, weight: .semibold, arabic: arabic),
                .foregroundColor: QUIColor.tint,
            ]
        }
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab

        let segmented = UISegmentedControl.appearance()
        segmented.selectedSegmentTintColor = QUIColor.tint
        segmented.setTitleTextAttributes([
            .font: QFonts.uiFont(.small, weight: .medium, arabic: arabic),
            .foregroundColor: QUIColor.ink,
        ], for: .normal)
        segmented.setTitleTextAttributes([
            .font: QFonts.uiFont(.small, weight: .semibold, arabic: arabic),
            .foregroundColor: UIColor.qDynamic(light: 0xFFFFFF, night: 0x0B1F1C),
        ], for: .selected)

        UIPageControl.appearance().currentPageIndicatorTintColor = QUIColor.saffron
        UIPageControl.appearance().pageIndicatorTintColor = UIColor(qHex: 0xFFFFFF, alpha: 0.55)
    }

    /// Small saffron dot drawn at the top of the selected tab ("active icon with a saffron dot").
    private static func selectionDot() -> UIImage {
        let size = CGSize(width: 44, height: 48)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { context in
            UIColor(qHex: 0xF4A300).setFill()
            context.cgContext.fillEllipse(in: CGRect(x: size.width / 2 - 2.5, y: 1, width: 5, height: 5))
        }
    }
}
