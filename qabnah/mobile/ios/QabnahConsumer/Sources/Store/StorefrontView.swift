import SwiftUI
import QabnahKit

@MainActor
final class StorefrontViewModel: ObservableObject {
    @Published private(set) var state: Loadable<Storefront> = .idle
    private let api: APIClient
    let slug: String

    init(api: APIClient, slug: String) {
        self.api = api
        self.slug = slug
    }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            state = .loaded(try await api.send(Endpoints.storefront(slug: slug)))
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            state = .failed(error)
        }
    }
}

/// Branded storefront: full-bleed cover with the scrim (name and status on the photo), a header
/// that turns solid with sticky category tabs once the cover has scrolled away, photo-led product
/// rows with the add button in the store's brand colour, and the floating night cart bar.
struct StorefrontView: View {
    @EnvironmentObject var lang: LanguageSettings
    @Environment(\.dismiss) var dismiss
    @StateObject private var vm: StorefrontViewModel
    private let api: APIClient
    private let summary: MerchantSummary?

    init(api: APIClient, slug: String, summary: MerchantSummary? = nil) {
        self.api = api
        self.summary = summary
        _vm = StateObject(wrappedValue: StorefrontViewModel(api: api, slug: slug))
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { sf in
                StorefrontContent(sf: sf, api: api, reload: { await vm.load() }, back: { dismiss() })
            }
            if vm.state.value == nil {
                Button { dismiss() } label: { QCircleIcon(systemImage: "chevron.backward") }
                    .padding(QTheme.space4)
                    .accessibilityLabel(lang.t("common.back"))
            }
        }
        .background(QTheme.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .task { if vm.state.value == nil { await vm.load() } }
    }
}

private struct StorefrontContent: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var cart: CartStore
    let sf: Storefront
    let api: APIClient
    let reload: () async -> Void
    let back: () -> Void

    @State private var selectedProduct: Product? = nil
    @State private var showCart = false
    @State private var scrolled = false
    @State private var activeSection: String? = nil

    private static let space = "storefront"
    private static let coverHeight: CGFloat = 280
    private static let moreId = "__more"

    private var brand: Color { Color(hex: sf.merchant.brandColor) ?? QTheme.primary }
    private var glyph: String { (sf.merchant.category ?? .other).glyph }

    private var sections: [StorefrontSection] {
        var out: [StorefrontSection] = []
        for category in sf.visibleCategories {
            out.append(StorefrontSection(id: category.id, title: lang.name(category), products: Self.sorted(category.products)))
        }
        if !sf.uncategorized.isEmpty {
            out.append(StorefrontSection(id: Self.moreId, title: lang.t("store.more"), products: Self.sorted(sf.uncategorized)))
        }
        return out
    }

    private static func sorted(_ products: [Product]) -> [Product] {
        products.sorted { a, b in a.sortOrder < b.sortOrder }
    }

    private var showsCartBar: Bool {
        guard let m = cart.cart.merchant else { return false }
        return m.id == sf.merchant.id && !cart.cart.isEmpty
    }

    var body: some View {
        ScrollViewReader { proxy in
            ZStack(alignment: .top) {
                scroll(proxy)
                topBar(proxy)
            }
        }
        .safeAreaInset(edge: .bottom) {
            if showsCartBar { CartBar { showCart = true } }
        }
        .sheet(item: $selectedProduct) { product in
            ProductSheet(product: product, merchant: sf.merchant.summary, isOpen: sf.merchant.isOpen)
        }
        .sheet(isPresented: $showCart) { CartView(api: api) }
    }

    private func scroll(_ proxy: ScrollViewProxy) -> some View {
        ScrollView {
            // Not lazy: every section must exist for `scrollTo`, and menus are short.
            VStack(alignment: .leading, spacing: 0) {
                StorefrontCover(merchant: sf.merchant, brand: brand, glyph: glyph, height: Self.coverHeight)
                StorefrontInfo(merchant: sf.merchant)
                if !sf.visibleBanners.isEmpty {
                    StorefrontBanners(banners: sf.visibleBanners, brand: brand)
                }
                if sections.count > 1 {
                    tabs(proxy).padding(.top, QTheme.space3)
                }
                ForEach(sections) { section in
                    sectionView(section)
                }
            }
            .padding(.bottom, QTheme.space6)
            .qReportScrollOffset(in: Self.space)
        }
        .coordinateSpace(name: Self.space)
        .ignoresSafeArea(edges: .top)
        .refreshable { await reload() }
        .onPreferenceChange(QScrollOffsetKey.self) { y in
            let past = y < -(Self.coverHeight - 110)
            if past != scrolled {
                withAnimation(.easeOut(duration: 0.2)) { scrolled = past }
            }
        }
    }

    /// Back button over the cover; once the cover is gone the bar turns solid and shows the
    /// store name with the sticky category tabs.
    private func topBar(_ proxy: ScrollViewProxy) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: QTheme.space3) {
                Button(action: back) { QCircleIcon(systemImage: "chevron.backward") }
                    .accessibilityLabel(lang.t("common.back"))
                    .accessibilityIdentifier("store.back")
                if scrolled {
                    Text(lang.name(sf.merchant.summary)).qFont(.h3).foregroundColor(QTheme.ink).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, QTheme.space4)
            .padding(.vertical, QTheme.space2)
            if scrolled && sections.count > 1 {
                tabs(proxy).padding(.bottom, QTheme.space2)
            }
        }
        .background((scrolled ? QTheme.surface : Color.clear).ignoresSafeArea(edges: .top))
        .overlay(alignment: .bottom) {
            if scrolled { Rectangle().fill(QTheme.line).frame(height: 1) }
        }
    }

    private func tabs(_ proxy: ScrollViewProxy) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: QTheme.space2) {
                ForEach(sections) { section in
                    tab(section, proxy)
                }
            }
            .padding(.horizontal, QTheme.space4)
        }
    }

    private func tab(_ section: StorefrontSection, _ proxy: ScrollViewProxy) -> some View {
        let selected = activeSection == section.id
        return Button {
            activeSection = section.id
            // Land the section title below the solid header (≈ 20 % down the screen).
            withAnimation(.easeOut(duration: 0.28)) {
                proxy.scrollTo(section.id, anchor: UnitPoint(x: 0.5, y: 0.2))
            }
        } label: {
            Text(section.title)
                .qFont(.small, .semibold)
                .foregroundColor(selected ? Color.white : QTheme.ink)
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background(selected ? brand : QTheme.surface)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(selected ? Color.clear : QTheme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func sectionView(_ section: StorefrontSection) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(section.title)
                .qFont(.h2)
                .foregroundColor(QTheme.ink)
                .padding(.horizontal, QTheme.space4)
                .padding(.top, QTheme.space6)
                .padding(.bottom, QTheme.space1)
                .accessibilityAddTraits(.isHeader)
                .id(section.id)
            ForEach(section.products) { product in
                Button { selectedProduct = product } label: {
                    ProductRow(product: product, brand: brand, glyph: glyph)
                }
                .buttonStyle(.plain)
                .disabled(!product.isOrderable)
                .accessibilityIdentifier("product.\(product.nameEn)")
                Rectangle().fill(QTheme.line).frame(height: 1).padding(.leading, QTheme.space4)
            }
        }
    }
}

private struct StorefrontSection: Identifiable {
    let id: String
    let title: String
    let products: [Product]
}

private struct StorefrontCover: View {
    @EnvironmentObject var lang: LanguageSettings
    let merchant: StorefrontMerchant
    let brand: Color
    let glyph: String
    let height: CGFloat

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            QPhoto(urlString: merchant.coverUrl, glyph: glyph, tint: brand)
            QCoverScrim()
            HStack(alignment: .bottom, spacing: QTheme.space3) {
                QLogoChip(urlString: merchant.logoUrl, name: lang.name(merchant.summary), brand: brand, size: 64)
                VStack(alignment: .leading, spacing: 6) {
                    Text(lang.name(merchant.summary))
                        .qFont(.h1)
                        .foregroundColor(QTheme.onNight)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                    StatusPill(text: lang.t(merchant.isOpen ? "store.open" : "store.closed"),
                               color: merchant.isOpen ? QTheme.success : QTheme.danger, solid: true)
                }
                Spacer(minLength: 0)
            }
            .padding(QTheme.space4)
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipped()
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

private struct StorefrontInfo: View {
    @EnvironmentObject var lang: LanguageSettings
    let merchant: StorefrontMerchant

    var body: some View {
        VStack(alignment: .leading, spacing: QTheme.space2) {
            if let tagline = merchant.summary.tagline(lang.language) {
                Text(tagline).qFont(.body).foregroundColor(QTheme.ink)
            }
            HStack(spacing: QTheme.space4) {
                if merchant.ratingCount > 0 {
                    Label("\(Formatters.rating(merchant.ratingAvg, language: lang.language)) (\(lang.digits("\(merchant.ratingCount)")))",
                          systemImage: "star.fill")
                }
                if let prep = merchant.prepTimeMinutes {
                    Label(lang.f("store.prep_minutes", prep), systemImage: "clock")
                }
                if merchant.minOrderBaisa > 0 {
                    Label(lang.f("store.min_order", lang.money(merchant.minOrderBaisa)), systemImage: "bag")
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            if let address = merchant.addressText, !address.isEmpty {
                Label(address, systemImage: "mappin.and.ellipse").lineLimit(2)
            }
        }
        .qFont(.small)
        .foregroundColor(QTheme.muted)
        .padding(.horizontal, QTheme.space4)
        .padding(.top, QTheme.space4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct StorefrontBanners: View {
    @EnvironmentObject var lang: LanguageSettings
    let banners: [Banner]
    let brand: Color

    var body: some View {
        TabView {
            ForEach(banners) { banner in
                ZStack(alignment: .bottomLeading) {
                    QPhoto(urlString: banner.imageUrl, glyph: "photo", tint: brand)
                    if let title = banner.title(lang.language), !title.isEmpty {
                        QCoverScrim()
                        Text(title).qFont(.h3).foregroundColor(QTheme.onNight).lineLimit(2).padding(QTheme.space4)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 150)
                .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusLg, style: .continuous))
                .padding(.horizontal, QTheme.space4)
                .accessibilityElement(children: .combine)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: banners.count > 1 ? .automatic : .never))
        .frame(height: 166)
        .padding(.top, QTheme.space4)
    }
}

/// Photo on the leading side (4:3), title 15/600, one-line description, price row with a circular
/// 36 pt add button in the store's brand colour.
struct ProductRow: View {
    @EnvironmentObject var lang: LanguageSettings
    let product: Product
    let brand: Color
    var glyph: String = "photo"

    var body: some View {
        HStack(alignment: .top, spacing: QTheme.space3) {
            QPhoto(urlString: product.imageUrl, glyph: glyph, tint: brand)
                .frame(width: 104, height: 78)
                .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(lang.name(product)).qFont(.body, .semibold).foregroundColor(QTheme.ink).lineLimit(2)
                if let d = product.description(lang.language) {
                    Text(d).qFont(.small).foregroundColor(QTheme.muted).lineLimit(1)
                }
                priceRow
            }
        }
        .padding(.horizontal, QTheme.space4)
        .padding(.vertical, QTheme.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .opacity(product.isOrderable ? 1 : 0.55)
        .accessibilityElement(children: .combine)
    }

    private var priceRow: some View {
        HStack(spacing: QTheme.space2) {
            QPrice(baisa: product.basePriceBaisa)
            if let compare = product.compareAtPriceBaisa, compare > product.basePriceBaisa {
                Text(lang.money(compare)).strikethrough().qFont(.small).foregroundColor(QTheme.muted)
            }
            Spacer(minLength: 0)
            if product.isOrderable {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(brand)
                    .clipShape(Circle())
                    .accessibilityHidden(true)
            } else {
                StatusPill(text: lang.t("product.unavailable"), color: QTheme.muted)
            }
        }
        .padding(.top, 2)
    }
}
