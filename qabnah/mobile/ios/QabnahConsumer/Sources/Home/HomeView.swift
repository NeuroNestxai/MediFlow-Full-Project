import SwiftUI
import QabnahKit

@MainActor
final class HomeViewModel: ObservableObject {
    @Published private(set) var state: Loadable<[MerchantSummary]> = .idle
    @Published var category: MerchantCategory?
    @Published var query = ""
    @Published private(set) var userLocation: LatLng?
    @Published private(set) var locationDenied = false

    private let api: APIClient
    let location = LocationProvider()

    init(api: APIClient) { self.api = api }

    func load() async {
        if userLocation == nil {
            if let loc = await location.currentLocation() {
                userLocation = loc.latLng
            }
            locationDenied = location.isDenied
        }
        if state.value == nil { state = .loading }
        do {
            let result = try await api.send(Endpoints.stores(near: userLocation, category: category, query: query, limit: 50))
            state = .loaded(result.items)
        } catch {
            if (error as? APIError)?.isCancelled == true { return }
            state = .failed(error)
        }
    }
}

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
                VStack(alignment: .leading, spacing: 16) {
                    if vm.locationDenied {
                        Label(lang.t("home.location_denied"), systemImage: "location.slash")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                            .padding(.horizontal)
                    }
                    categoryChips
                    content
                }
                .padding(.vertical)
            }
            .background(Color(.systemGroupedBackground))
            .refreshable { await vm.load() }
            .searchable(text: $vm.query, prompt: lang.t("home.search"))
            .navigationTitle(lang.t("home.title"))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    CartToolbarButton { showCart = true }
                }
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

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(title: lang.t("category.all"), selected: vm.category == nil) { vm.category = nil }
                ForEach(MerchantCategory.knownCases, id: \.self) { c in
                    chip(title: lang.t("category.\(c.rawValue)"), selected: vm.category == c) { vm.category = c }
                }
            }
            .padding(.horizontal)
        }
    }

    private func chip(title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .foregroundColor(selected ? .white : .primary)
                .background(selected ? Brand.primary : Color(.secondarySystemGroupedBackground))
                .clipShape(Capsule())
        }
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder private var content: some View {
        switch vm.state {
        case .idle, .loading:
            LoadingView().frame(minHeight: 240)
        case .failed(let error):
            ErrorStateView(error: error) { Task { await vm.load() } }.frame(minHeight: 240)
        case .loaded(let stores):
            if stores.isEmpty {
                EmptyStateView(systemImage: "storefront", title: lang.t("home.empty"), message: lang.t("home.empty_hint"))
                    .frame(minHeight: 240)
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(stores) { store in
                        NavigationLink {
                            StorefrontView(api: api, slug: store.slug, summary: store)
                        } label: {
                            StoreCard(store: store)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
        }
    }
}

struct StoreCard: View {
    @EnvironmentObject var lang: LanguageSettings
    let store: MerchantSummary

    private var brand: Color { Color(hex: store.brandColor) ?? Brand.primary }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                if store.coverUrl != nil {
                    RemoteImage(urlString: store.coverUrl)
                } else {
                    LinearGradient(colors: [brand, (Color(hex: store.accentColor) ?? brand).opacity(0.7)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                }
                RemoteImage(urlString: store.logoUrl, placeholderIcon: "storefront")
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: Brand.radiusMd))
                    .overlay(RoundedRectangle(cornerRadius: Brand.radiusMd).stroke(Color.white, lineWidth: 2))
                    .padding(12)
            }
            .frame(height: 120)
            .clipped()
            .overlay(alignment: .topTrailing) {
                if !store.isOpen {
                    StatusPill(text: lang.t("store.closed"), color: Brand.danger)
                        .background(.regularMaterial, in: Capsule())
                        .padding(10)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(lang.name(store)).font(.headline).foregroundColor(brand)
                if let tagline = store.tagline(lang.language) {
                    Text(tagline).font(.subheadline).foregroundColor(.secondary).lineLimit(1)
                }
                HStack(spacing: 12) {
                    if store.ratingCount > 0 {
                        Label(Formatters.rating(store.ratingAvg, language: lang.language), systemImage: "star.fill")
                    }
                    if let prep = store.prepTimeMinutes {
                        Label(lang.f("store.prep_minutes", prep), systemImage: "clock")
                    }
                    if let d = store.distanceM {
                        Label(lang.distance(d), systemImage: "location")
                    }
                }
                .font(.caption)
                .foregroundColor(.secondary)
            }
            .padding(12)
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: Brand.radiusLg, style: .continuous))
        .opacity(store.isOpen ? 1 : 0.75)
        .accessibilityElement(children: .combine)
    }
}

struct CartToolbarButton: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var cart: CartStore
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "cart")
                if cart.cart.itemCount > 0 {
                    Text(lang.digits("\(cart.cart.itemCount)"))
                        .font(.caption2.bold())
                        .foregroundColor(.white)
                        .padding(4)
                        .background(Brand.accent, in: Circle())
                        .offset(x: 10, y: -10)
                }
            }
        }
        .accessibilityLabel(lang.f("cart.a11y", cart.cart.itemCount))
    }
}
