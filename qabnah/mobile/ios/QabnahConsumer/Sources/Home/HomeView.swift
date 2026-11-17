import SwiftUI
import QabnahKit

@MainActor
final class HomeViewModel: ObservableObject {
    @Published private(set) var state: Loadable<[MerchantSummary]> = .idle
    @Published var category: MerchantCategory?
    @Published var query = ""
    @Published private(set) var userLocation: LatLng?
    @Published private(set) var locationDenied = false
    /// The last unfiltered result: feeds the featured carousel and the category photos.
    @Published private(set) var catalog: [MerchantSummary] = []

    private let api: APIClient
    let location = LocationProvider()

    init(api: APIClient) { self.api = api }

    var isFiltering: Bool {
        category != nil || !query.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Up to five open stores that have a cover photo.
    var featured: [MerchantSummary] {
        Array(catalog.filter { $0.isOpen && !($0.coverUrl ?? "").isEmpty }.prefix(5))
    }

    /// A real photo for a category chip: the cover of the first store in that category.
    func photo(for category: MerchantCategory) -> String? {
        catalog.first { $0.category == category && !($0.coverUrl ?? "").isEmpty }?.coverUrl
    }

    func clearFilters() {
        category = nil
        query = ""
    }

    func load() async {
        if userLocation == nil {
            if let loc = await location.currentLocation() {
                userLocation = loc.latLng
            }
            locationDenied = location.isDenied
        }
        if state.value == nil { state = .loading }
        let unfiltered = !isFiltering
        do {
            let result = try await api.send(Endpoints.stores(near: userLocation, category: category, query: query, limit: 50))
            state = .loaded(result.items)
            if unfiltered { catalog = result.items }
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            state = .failed(error)
        }
    }
}

/// Photo-led home: greeting + location pill, search, featured stores carousel, category chips
/// with photos, store cards; the night cart bar floats above the tab bar once the cart has items.
struct HomeView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var cart: CartStore
    @StateObject private var vm: HomeViewModel
    @State private var showCart = false
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
        _vm = StateObject(wrappedValue: HomeViewModel(api: api))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: QTheme.space5) {
                    HomeHeader(vm: vm)
                    if !vm.isFiltering && !vm.featured.isEmpty {
                        FeaturedCarousel(stores: vm.featured, api: api)
                    }
                    CategoryStrip(vm: vm)
                    content
                }
                .padding(.top, QTheme.space2)
                .padding(.bottom, QTheme.space6)
            }
            .qScreen()
            .refreshable { await vm.load() }
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .bottom) {
                if !cart.cart.isEmpty { CartBar { showCart = true } }
            }
            .sheet(isPresented: $showCart) { CartView(api: api) }
        }
        // Debounced reload on query / category change (also the initial load).
        .task(id: "\(vm.query)|\(vm.category?.rawValue ?? "")") {
            if vm.state.value != nil { try? await Task.sleep(nanoseconds: 350_000_000) }
            guard !Task.isCancelled else { return }
            await vm.load()
        }
    }

    @ViewBuilder private var content: some View {
        switch vm.state {
        case .idle, .loading:
            StoreListSkeleton()
        case .failed(let error):
            ErrorStateView(error: error) { Task { await vm.load() } }.frame(minHeight: 240)
        case .loaded(let stores):
            if stores.isEmpty {
                EmptyStateView(systemImage: "building.2", title: lang.t("home.empty"), message: lang.t("home.empty_hint"),
                               actionTitle: lang.t("home.clear_filters"), action: clearAction)
                    .frame(minHeight: 240)
            } else {
                storeList(stores)
            }
        }
    }

    /// "Clear filters" only makes sense while a category or a search is active.
    private var clearAction: (() -> Void)? {
        guard vm.isFiltering else { return nil }
        return { vm.clearFilters() }
    }

    private func storeList(_ stores: [MerchantSummary]) -> some View {
        LazyVStack(spacing: QTheme.space4) {
            ForEach(stores) { store in
                NavigationLink {
                    StorefrontView(api: api, slug: store.slug, summary: store)
                } label: {
                    StoreCard(store: store)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("store.\(store.slug)")
            }
        }
        .padding(.horizontal, QTheme.space4)
    }
}

// MARK: - Header

private struct HomeHeader: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @ObservedObject var vm: HomeViewModel

    private var greeting: String {
        let full = session.me?.user.fullName ?? ""
        let name = full.split(separator: " ").first.map { String($0) } ?? ""
        return name.isEmpty ? lang.t("home.greeting") : lang.f("home.greeting_name", name)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            Text(greeting)
                .qFont(.h1)
                .foregroundColor(QTheme.ink)
                .accessibilityAddTraits(.isHeader)
            locationPill
            if vm.locationDenied {
                Text(lang.t("home.location_denied")).qFont(.small).foregroundColor(QTheme.muted)
            }
            searchField
        }
        .padding(.horizontal, QTheme.space4)
    }

    private var locationPill: some View {
        Button {
            if vm.locationDenied, let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: vm.userLocation == nil ? "location.slash" : "location.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .accessibilityHidden(true)
                Text(lang.t(vm.userLocation == nil ? "home.all_stores" : "home.near_you")).qFont(.small, .semibold)
            }
            .foregroundColor(QTheme.primary)
            .padding(.horizontal, 12)
            .frame(minHeight: 32)
            .background(QTheme.primarySoft)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!vm.locationDenied)
        .accessibilityHint(vm.locationDenied ? lang.t("common.open_settings") : "")
    }

    private var searchField: some View {
        HStack(spacing: QTheme.space2) {
            Image(systemName: "magnifyingglass").foregroundColor(QTheme.muted).accessibilityHidden(true)
            TextField(lang.t("home.search"), text: $vm.query)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .accessibilityIdentifier("home.search")
            if !vm.query.isEmpty {
                Button { vm.query = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(QTheme.muted)
                }
                .accessibilityLabel(lang.t("common.cancel"))
            }
        }
        .qField()
    }
}

// MARK: - Featured carousel

private struct FeaturedCarousel: View {
    let stores: [MerchantSummary]
    let api: APIClient

    var body: some View {
        TabView {
            ForEach(stores) { store in
                NavigationLink {
                    StorefrontView(api: api, slug: store.slug, summary: store)
                } label: {
                    FeaturedStoreCard(store: store)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("featured.\(store.slug)")
            }
        }
        .tabViewStyle(.page(indexDisplayMode: stores.count > 1 ? .automatic : .never))
        .frame(height: 200)
    }
}

private struct FeaturedStoreCard: View {
    @EnvironmentObject var lang: LanguageSettings
    let store: MerchantSummary

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            QPhoto(urlString: store.coverUrl, glyph: (store.category ?? .other).glyph,
                   tint: Color(hex: store.brandColor))
            QCoverScrim()
            VStack(alignment: .leading, spacing: 2) {
                Text(lang.name(store)).qFont(.h2).foregroundColor(QTheme.onNight).lineLimit(1)
                if let tagline = store.tagline(lang.language) {
                    Text(tagline).qFont(.small).foregroundColor(QTheme.onNightMuted).lineLimit(1)
                }
            }
            .padding(QTheme.space4)
            .padding(.bottom, QTheme.space4)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 190)
        .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusLg, style: .continuous))
        .padding(.horizontal, QTheme.space4)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Category chips with photos

private struct CategoryStrip: View {
    @EnvironmentObject var lang: LanguageSettings
    @ObservedObject var vm: HomeViewModel

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: QTheme.space3) {
                chip(title: lang.t("category.all"), photo: nil, glyph: "square.grid.2x2", selected: vm.category == nil) {
                    vm.category = nil
                }
                ForEach(MerchantCategory.knownCases, id: \.self) { c in
                    chip(title: lang.t("category.\(c.rawValue)"), photo: vm.photo(for: c), glyph: c.glyph,
                         selected: vm.category == c) {
                        vm.category = c
                    }
                }
            }
            .padding(.horizontal, QTheme.space4)
            .padding(.vertical, 2)
        }
    }

    private func chip(title: String, photo: String?, glyph: String, selected: Bool,
                      action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                QPhoto(urlString: photo, glyph: glyph)
                    .frame(width: 68, height: 68)
                    .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous)
                        .stroke(selected ? QTheme.primary : Color.clear, lineWidth: 2.5))
                Text(title)
                    .qFont(.small, selected ? QFontWeight.semibold : QFontWeight.regular)
                    .foregroundColor(selected ? QTheme.primary : QTheme.ink)
                    .lineLimit(1)
            }
            .frame(minWidth: 72)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: - Store card

/// Cover 16:9 with the open/closed pill top-start, logo overlapping the cover's bottom edge,
/// name 17/600 and a muted meta row.
struct StoreCard: View {
    @EnvironmentObject var lang: LanguageSettings
    let store: MerchantSummary

    private var brand: Color { Color(hex: store.brandColor) ?? QTheme.primary }

    private var meta: String {
        var parts: [String] = []
        if let c = store.category, c != .unknown { parts.append(lang.t("category.\(c.rawValue)", fallback: c.rawValue)) }
        if let prep = store.prepTimeMinutes { parts.append(lang.f("store.prep_minutes", prep)) }
        if let d = store.distanceM { parts.append(lang.distance(d)) }
        if store.minOrderBaisa > 0 { parts.append(lang.f("store.min_order", lang.money(store.minOrderBaisa))) }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            cover.zIndex(1)
            VStack(alignment: .leading, spacing: 4) {
                Text(lang.name(store)).qFont(.h3).foregroundColor(QTheme.ink).lineLimit(1)
                if !meta.isEmpty {
                    Text(meta).qFont(.small).foregroundColor(QTheme.muted).lineLimit(1)
                }
                if store.ratingCount > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "star.fill").font(.system(size: 11)).accessibilityHidden(true)
                        Text(Formatters.rating(store.ratingAvg, language: lang.language)).qFont(.small, .semibold, tabular: true)
                        Text(verbatim: "(\(lang.digits("\(store.ratingCount)")))").qFont(.small, tabular: true)
                    }
                    .foregroundColor(QTheme.muted)
                }
            }
            .padding(.horizontal, QTheme.space4)
            .padding(.top, 36)
            .padding(.bottom, QTheme.space4)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .cardChrome()
        .accessibilityElement(children: .combine)
    }

    private var cover: some View {
        Color.clear
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .overlay(QPhoto(urlString: store.coverUrl, glyph: (store.category ?? .other).glyph, tint: brand))
            .clipped()
            .overlay(alignment: .topLeading) {
                StatusPill(text: lang.t(store.isOpen ? "store.open" : "store.closed"),
                           color: store.isOpen ? QTheme.success : QTheme.danger, solid: true)
                    .padding(QTheme.space3)
            }
            .overlay(alignment: .bottomLeading) {
                QLogoChip(urlString: store.logoUrl, name: lang.name(store), brand: brand)
                    .padding(.leading, QTheme.space4)
                    .offset(y: 28)
            }
    }
}

private struct StoreListSkeleton: View {
    var body: some View {
        VStack(spacing: QTheme.space4) {
            ForEach(0..<3, id: \.self) { _ in
                VStack(alignment: .leading, spacing: QTheme.space2) {
                    QSkeleton(height: 170, radius: QTheme.radiusMd)
                    QSkeleton(width: 180, height: 16)
                    QSkeleton(width: 120, height: 12)
                }
            }
        }
        .padding(.horizontal, QTheme.space4)
        .accessibilityHidden(true)
    }
}

// MARK: - Floating cart bar

/// Night bar with a saffron CTA; shown once the cart has items.
struct CartBar: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var cart: CartStore
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: QTheme.space3) {
                Text(lang.digits("\(cart.cart.itemCount)"))
                    .qFont(.small, .bold, tabular: true)
                    .foregroundColor(QTheme.onNight)
                    .frame(minWidth: 30, minHeight: 30)
                    .background(QTheme.night2)
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 0) {
                    if let m = cart.cart.merchant {
                        Text(lang.name(m)).qFont(.small).foregroundColor(QTheme.onNightMuted).lineLimit(1)
                    }
                    QPrice(baisa: cart.cart.subtotalBaisa, style: .h3, color: QTheme.onNight,
                           currencyColor: QTheme.onNightMuted)
                }
                Spacer(minLength: QTheme.space2)
                Text(lang.t("cart.view"))
                    .qFont(.h3)
                    .foregroundColor(QTheme.inkOnLight)
                    .padding(.horizontal, QTheme.space4)
                    .frame(minHeight: 40)
                    .background(QTheme.saffron)
                    .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusButton, style: .continuous))
            }
            .padding(.horizontal, QTheme.space3)
            .padding(.vertical, 10)
            .background(QTheme.night)
            .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous))
            .qElevation2()
        }
        .buttonStyle(.plain)
        .padding(.horizontal, QTheme.space4)
        .padding(.bottom, QTheme.space2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(lang.f("cart.a11y", cart.cart.itemCount))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("cart.bar")
    }
}
