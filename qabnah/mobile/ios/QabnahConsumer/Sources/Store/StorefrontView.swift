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

struct StorefrontView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var cart: CartStore
    @StateObject private var vm: StorefrontViewModel
    @State private var selectedProduct: Product? = nil
    @State private var showCart = false
    private let api: APIClient
    private let summary: MerchantSummary?

    init(api: APIClient, slug: String, summary: MerchantSummary? = nil) {
        self.api = api
        self.summary = summary
        _vm = StateObject(wrappedValue: StorefrontViewModel(api: api, slug: slug))
    }

    var body: some View {
        LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { sf in
            let brand = Color(hex: sf.merchant.brandColor) ?? Brand.primary
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header(sf, brand: brand)
                    if !sf.visibleBanners.isEmpty { banners(sf.visibleBanners) }
                    ForEach(sf.visibleCategories) { cat in
                        section(title: lang.name(cat), products: cat.products, brand: brand)
                    }
                    if !sf.uncategorized.isEmpty {
                        section(title: lang.t("store.more"), products: sf.uncategorized, brand: brand)
                    }
                    Spacer(minLength: 80)
                }
            }
            .refreshable { await vm.load() }
            .tint(brand)
            .safeAreaInset(edge: .bottom) {
                if let m = cart.cart.merchant, m.id == sf.merchant.id, !cart.cart.isEmpty {
                    Button { showCart = true } label: {
                        HStack {
                            Text(lang.f("cart.view_count", cart.cart.itemCount))
                            Spacer()
                            Text(lang.money(cart.cart.subtotalBaisa))
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle(color: brand))
                    .padding()
                    .background(.bar)
                }
            }
            .sheet(item: $selectedProduct) { product in
                ProductSheet(product: product, merchant: sf.merchant.summary, isOpen: sf.merchant.isOpen)
            }
            .sheet(isPresented: $showCart) { CartView(api: api) }
            .navigationTitle(lang.name(sf.merchant.summary))
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { if vm.state.value == nil { await vm.load() } }
    }

    private func header(_ sf: Storefront, brand: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                if sf.merchant.coverUrl != nil {
                    RemoteImage(urlString: sf.merchant.coverUrl)
                } else {
                    LinearGradient(colors: [brand, (Color(hex: sf.merchant.accentColor) ?? brand).opacity(0.7)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                }
                RemoteImage(urlString: sf.merchant.logoUrl, placeholderIcon: "storefront")
                    .frame(width: 72, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: Brand.radiusLg))
                    .overlay(RoundedRectangle(cornerRadius: Brand.radiusLg).stroke(Color.white, lineWidth: 3))
                    .padding()
            }
            .frame(height: 170)
            .clipped()

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(lang.name(sf.merchant.summary)).font(.title2.bold()).foregroundColor(brand)
                    Spacer()
                    StatusPill(text: lang.t(sf.merchant.isOpen ? "store.open" : "store.closed"),
                               color: sf.merchant.isOpen ? Brand.success : Brand.danger)
                }
                if let tagline = sf.merchant.summary.tagline(lang.language) {
                    Text(tagline).foregroundColor(.secondary)
                }
                HStack(spacing: 14) {
                    if sf.merchant.ratingCount > 0 {
                        Label("\(Formatters.rating(sf.merchant.ratingAvg, language: lang.language)) (\(lang.digits("\(sf.merchant.ratingCount)")))",
                              systemImage: "star.fill")
                    }
                    if let prep = sf.merchant.prepTimeMinutes {
                        Label(lang.f("store.prep_minutes", prep), systemImage: "clock")
                    }
                    if sf.merchant.minOrderBaisa > 0 {
                        Label(lang.f("store.min_order", lang.money(sf.merchant.minOrderBaisa)), systemImage: "cart")
                    }
                }
                .font(.caption)
                .foregroundColor(.secondary)
                if let address = sf.merchant.addressText, !address.isEmpty {
                    Label(address, systemImage: "mappin.and.ellipse").font(.caption).foregroundColor(.secondary)
                }
            }
            .padding(.horizontal)
            .padding(.top, 12)
        }
    }

    private func banners(_ banners: [Banner]) -> some View {
        TabView {
            ForEach(banners) { b in
                ZStack(alignment: .bottomLeading) {
                    RemoteImage(urlString: b.imageUrl)
                    if let title = b.title(lang.language) {
                        Text(title)
                            .font(.headline)
                            .foregroundColor(.white)
                            .padding(8)
                            .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: Brand.radiusSm))
                            .padding(10)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: Brand.radiusMd))
                .padding(.horizontal)
                .accessibilityElement(children: .combine)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: banners.count > 1 ? .automatic : .never))
        .frame(height: 150)
    }

    private func section(title: String, products: [Product], brand: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.title3.bold()).padding(.horizontal)
            ForEach(products.sorted { $0.sortOrder < $1.sortOrder }) { p in
                Button { selectedProduct = p } label: { ProductRow(product: p, brand: brand) }
                    .buttonStyle(.plain)
                    .disabled(!p.isOrderable)
                Divider().padding(.leading)
            }
        }
    }
}

struct ProductRow: View {
    @EnvironmentObject var lang: LanguageSettings
    let product: Product
    let brand: Color

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(lang.name(product)).font(.headline)
                if let d = product.description(lang.language) {
                    Text(d).font(.subheadline).foregroundColor(.secondary).lineLimit(2)
                }
                HStack(spacing: 8) {
                    Text(lang.money(product.basePriceBaisa)).font(.subheadline.bold()).foregroundColor(brand)
                    if let compare = product.compareAtPriceBaisa, compare > product.basePriceBaisa {
                        Text(lang.money(compare)).font(.caption).strikethrough().foregroundColor(.secondary)
                    }
                    if !product.isOrderable {
                        StatusPill(text: lang.t("product.unavailable"), color: .secondary)
                    }
                }
            }
            Spacer()
            if product.imageUrl != nil {
                RemoteImage(urlString: product.imageUrl)
                    .frame(width: 84, height: 84)
                    .clipShape(RoundedRectangle(cornerRadius: Brand.radiusMd))
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .opacity(product.isOrderable ? 1 : 0.5)
        .accessibilityElement(children: .combine)
    }
}
