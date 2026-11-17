import SwiftUI
import QabnahKit

/// Branded placeholder for a missing image: `night-2` → `primary-deep` diagonal gradient with an
/// outlined glyph at 40 % white. On a merchant's storefront the gradient ends in the merchant's
/// brand colour. (One of the two gradients the design system allows.)
struct QPhotoPlaceholder: View {
    var glyph: String = "photo"
    var tint: Color? = nil

    var body: some View {
        GeometryReader { geo in
            ZStack {
                LinearGradient(colors: [QTheme.night2, tint ?? QTheme.primaryDeep],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                Image(systemName: glyph)
                    .font(.system(size: max(14, min(geo.size.width, geo.size.height) * 0.34), weight: .light))
                    .foregroundColor(Color.white.opacity(0.4))
            }
        }
        .accessibilityHidden(true)
    }
}

/// Bottom scrim for covers: night at 85 % fading out at 60 % of the height, so the store name and
/// status can sit on the photo in white. (The other allowed gradient.)
struct QCoverScrim: View {
    var body: some View {
        LinearGradient(stops: [
            .init(color: QTheme.night.opacity(0.85), location: 0),
            .init(color: QTheme.night.opacity(0), location: 0.6),
        ], startPoint: .bottom, endPoint: .top)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Image from the API (absolute or server-relative URL): shimmer while loading, cross-fade in,
/// branded placeholder when there is no image or it fails. Fills its frame; the caller sizes and
/// clips it (or uses `QPhotoBox` for a fixed aspect ratio).
struct QPhoto: View {
    @EnvironmentObject var session: SessionStore
    let urlString: String?
    var glyph: String = "photo"
    var tint: Color? = nil
    var contentMode: ContentMode = .fill

    var body: some View {
        if let url = session.api.config.resolve(urlString) {
            AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.22))) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: contentMode)
                case .failure:
                    QPhotoPlaceholder(glyph: glyph, tint: tint)
                default:
                    QShimmer()
                }
            }
        } else {
            QPhotoPlaceholder(glyph: glyph, tint: tint)
        }
    }
}

/// A photo in a fixed aspect ratio (4:3 product, 16:9 store cover, 16:10 product sheet), clipped
/// to the image radius.
struct QPhotoBox: View {
    let urlString: String?
    var aspect: CGFloat = 4.0 / 3.0
    var radius: CGFloat = QTheme.radiusMd
    var glyph: String = "photo"
    var tint: Color? = nil

    var body: some View {
        Color.clear
            .aspectRatio(aspect, contentMode: .fit)
            .overlay(QPhoto(urlString: urlString, glyph: glyph, tint: tint))
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// Compatibility name for older call sites.
struct RemoteImage: View {
    let urlString: String?
    var contentMode: ContentMode = .fill
    var placeholderIcon: String = "photo"

    var body: some View {
        QPhoto(urlString: urlString, glyph: placeholderIcon, contentMode: contentMode)
    }
}

/// Store logo: rounded square (radius 14 at 56 pt) with a 2 pt white ring. Without a logo, the
/// merchant's initial in white on their brand colour — the only letter avatar the system allows.
struct QLogoChip: View {
    @EnvironmentObject var session: SessionStore
    let urlString: String?
    let name: String
    var brand: Color = QTheme.primary
    var size: CGFloat = 56

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: size * 0.25, style: .continuous)
    }

    var body: some View {
        Group {
            if session.api.config.resolve(urlString) != nil {
                QPhoto(urlString: urlString, glyph: "storefront", tint: brand)
            } else {
                ZStack {
                    brand
                    Text(verbatim: String(name.trimmingCharacters(in: .whitespaces).prefix(1)))
                        .qFont(size: size * 0.42, .bold, relativeTo: .title2)
                        .foregroundColor(.white)
                }
            }
        }
        .frame(width: size, height: size)
        .background(Color.white)
        .clipShape(shape)
        .overlay(shape.stroke(Color.white, lineWidth: 2))
        .qElevation1()
        .accessibilityHidden(true)
    }
}

extension MerchantCategory {
    /// Outlined glyph for the branded placeholder and category chips.
    var glyph: String {
        switch self {
        case .restaurant: return "fork.knife"
        case .cafe: return "cup.and.saucer"
        case .grocery: return "basket"
        case .pharmacy: return "cross.case"
        case .retail: return "bag"
        case .flowers: return "leaf"
        case .electronics: return "headphones"
        case .other, .unknown: return "storefront"
        }
    }
}
