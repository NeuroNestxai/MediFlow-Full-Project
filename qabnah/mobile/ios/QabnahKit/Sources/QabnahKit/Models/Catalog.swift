import Foundation

/// `MerchantSummary` (store cards on Home, base of the storefront merchant).
public struct MerchantSummary: Codable, Hashable, Identifiable, Sendable, BilingualNamed {
    public var id: String
    @DefaultEmptyString public var slug: String
    @DefaultEmptyString public var nameEn: String
    @DefaultEmptyString public var nameAr: String
    public var category: MerchantCategory?
    public var logoUrl: String?
    public var coverUrl: String?
    public var brandColor: String?
    public var accentColor: String?
    public var taglineEn: String?
    public var taglineAr: String?
    @DefaultZeroDouble public var ratingAvg: Double
    @DefaultZero public var ratingCount: Int
    /// Store toggle AND within opening hours.
    @DefaultFalse public var isOpen: Bool
    public var prepTimeMinutes: Int?
    @DefaultZero public var minOrderBaisa: Int
    @DefaultFalse public var acceptsCod: Bool
    @DefaultFalse public var acceptsOnline: Bool
    public var distanceM: Int?
    public var location: LatLng?

    public func tagline(_ language: AppLanguage) -> String? {
        let preferred = language == .ar ? taglineAr : taglineEn
        let fallback = language == .ar ? taglineEn : taglineAr
        if let p = preferred, !p.isEmpty { return p }
        return fallback
    }
}

public struct OpeningHours: Codable, Hashable, Sendable {
    /// 0 = Sunday.
    public var weekday: Int
    public var open: String
    public var close: String
}

/// `Storefront.merchant` = `MerchantSummary` + `{addressText, whatsappPhone, openingHours}`.
/// Decoded by composition; summary fields are reachable directly through dynamic member lookup.
@dynamicMemberLookup
public struct StorefrontMerchant: Codable, Hashable, Sendable {
    public var summary: MerchantSummary
    public var addressText: String?
    public var whatsappPhone: String?
    public var openingHours: [OpeningHours]

    private enum ExtraKeys: String, CodingKey { case addressText, whatsappPhone, openingHours }

    public init(from decoder: Decoder) throws {
        summary = try MerchantSummary(from: decoder)
        let c = try decoder.container(keyedBy: ExtraKeys.self)
        addressText = try c.decodeIfPresent(String.self, forKey: .addressText)
        whatsappPhone = try c.decodeIfPresent(String.self, forKey: .whatsappPhone)
        openingHours = try c.decodeIfPresent([OpeningHours].self, forKey: .openingHours) ?? []
    }

    public func encode(to encoder: Encoder) throws {
        try summary.encode(to: encoder)
        var c = encoder.container(keyedBy: ExtraKeys.self)
        try c.encodeIfPresent(addressText, forKey: .addressText)
        try c.encodeIfPresent(whatsappPhone, forKey: .whatsappPhone)
        try c.encode(openingHours, forKey: .openingHours)
    }

    public subscript<T>(dynamicMember keyPath: KeyPath<MerchantSummary, T>) -> T {
        summary[keyPath: keyPath]
    }
}

public struct Banner: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    @DefaultEmptyString public var imageUrl: String
    public var titleEn: String?
    public var titleAr: String?
    public var linkUrl: String?
    @DefaultZero public var sortOrder: Int
    public var isActive: Bool?

    public func title(_ language: AppLanguage) -> String? {
        language == .ar ? (titleAr ?? titleEn) : (titleEn ?? titleAr)
    }
}

public struct ProductOption: Codable, Hashable, Identifiable, Sendable, BilingualNamed {
    public var id: String
    @DefaultEmptyString public var nameEn: String
    @DefaultEmptyString public var nameAr: String
    @DefaultZero public var priceDeltaBaisa: Int
    public var isAvailable: Bool?

    public var available: Bool { isAvailable ?? true }
}

public struct OptionGroup: Codable, Hashable, Identifiable, Sendable, BilingualNamed {
    public var id: String
    public var kind: OptionGroupKind
    @DefaultEmptyString public var nameEn: String
    @DefaultEmptyString public var nameAr: String
    @DefaultZero public var minSelect: Int
    public var maxSelect: Int?
    @DefaultEmpty public var options: [ProductOption]

    /// Effective upper bound. Variants are single-choice (radio) regardless of `maxSelect`;
    /// add-ons default to "any number" when the server omits `maxSelect` or sends 0.
    public var effectiveMax: Int {
        if kind == .variant { return 1 }
        if let m = maxSelect, m > 0 { return m }
        return options.count
    }
}

public struct Product: Codable, Hashable, Identifiable, Sendable, BilingualNamed {
    public var id: String
    public var categoryId: String?
    @DefaultEmptyString public var nameEn: String
    @DefaultEmptyString public var nameAr: String
    public var descriptionEn: String?
    public var descriptionAr: String?
    public var imageUrl: String?
    public var sku: String?
    @DefaultZero public var basePriceBaisa: Int
    public var compareAtPriceBaisa: Int?
    public var isAvailable: Bool?
    @DefaultFalse public var trackStock: Bool
    @DefaultZero public var stockQty: Int
    @DefaultZero public var sortOrder: Int
    @DefaultEmpty public var optionGroups: [OptionGroup]

    public func description(_ language: AppLanguage) -> String? {
        let d = language == .ar ? (descriptionAr ?? descriptionEn) : (descriptionEn ?? descriptionAr)
        return (d?.isEmpty ?? true) ? nil : d
    }

    /// Orderable now: available and (if stock is tracked) in stock.
    public var isOrderable: Bool {
        (isAvailable ?? true) && (!trackStock || stockQty > 0)
    }

    /// Max quantity a customer may pick (contract caps at 99; stock caps further).
    public var maxQuantity: Int {
        trackStock ? max(0, min(99, stockQty)) : 99
    }
}

/// `Storefront.categories[]` = `Category` + `{products}`.
public struct StorefrontCategory: Codable, Hashable, Identifiable, Sendable, BilingualNamed {
    public var id: String
    @DefaultEmptyString public var nameEn: String
    @DefaultEmptyString public var nameAr: String
    @DefaultZero public var sortOrder: Int
    public var isActive: Bool?
    @DefaultEmpty public var products: [Product]
}

/// `GET /stores/{slug}`.
public struct Storefront: Codable, Hashable, Sendable {
    public var merchant: StorefrontMerchant
    @DefaultEmpty public var banners: [Banner]
    @DefaultEmpty public var categories: [StorefrontCategory]
    @DefaultEmpty public var uncategorized: [Product]

    /// Banners that should be shown, in display order.
    public var visibleBanners: [Banner] {
        banners.filter { $0.isActive != false }.sorted { $0.sortOrder < $1.sortOrder }
    }

    /// Non-empty, active categories in display order.
    public var visibleCategories: [StorefrontCategory] {
        categories
            .filter { ($0.isActive ?? true) && !$0.products.isEmpty }
            .sorted { $0.sortOrder < $1.sortOrder }
    }
}
