import Foundation

// MARK: - Product option selection

/// Selection state for a product sheet: variant groups behave as radio buttons,
/// add-on groups as checkboxes capped at `maxSelect`. Unit price = base + selected deltas.
public struct ProductSelection: Hashable, Sendable {
    public let product: Product
    /// groupId → selected optionIds (in tap order).
    public private(set) var selected: [String: [String]]

    public init(product: Product) {
        self.product = product
        var initial: [String: [String]] = [:]
        // Pre-select the first available variant of required variant groups.
        for g in product.optionGroups where g.kind == .variant && g.minSelect >= 1 {
            if let first = g.options.first(where: \.available) { initial[g.id] = [first.id] }
        }
        self.selected = initial
    }

    public func isSelected(_ option: ProductOption, in group: OptionGroup) -> Bool {
        selected[group.id]?.contains(option.id) ?? false
    }

    /// Whether tapping `option` would currently be allowed (disabled checkboxes once the cap is hit).
    public func canSelect(_ option: ProductOption, in group: OptionGroup) -> Bool {
        guard option.available else { return false }
        if isSelected(option, in: group) || group.kind == .variant { return true }
        return (selected[group.id]?.count ?? 0) < group.effectiveMax
    }

    public mutating func toggle(_ option: ProductOption, in group: OptionGroup) {
        guard option.available else { return }
        var current = selected[group.id] ?? []
        if group.kind == .variant {
            // Radio: tapping the selected one only clears it when the group is optional.
            if current == [option.id] {
                if group.minSelect == 0 { current = [] }
            } else {
                current = [option.id]
            }
        } else if let idx = current.firstIndex(of: option.id) {
            current.remove(at: idx)
        } else if current.count < group.effectiveMax {
            current.append(option.id)
        }
        selected[group.id] = current
    }

    /// Groups whose selection count is outside `[minSelect, effectiveMax]`.
    public var unsatisfiedGroups: [OptionGroup] {
        product.optionGroups.filter { g in
            let n = selected[g.id]?.count ?? 0
            return n < g.minSelect || n > g.effectiveMax
        }
    }

    public var isValid: Bool { unsatisfiedGroups.isEmpty && product.isOrderable }

    public var selectedOptions: [ProductOption] {
        product.optionGroups.flatMap { g in
            g.options.filter { (selected[g.id] ?? []).contains($0.id) }
        }
    }

    /// Option ids in product display order (stable for cart-line identity).
    public var selectedOptionIds: [String] { selectedOptions.map(\.id) }

    public var unitPriceBaisa: Int {
        product.basePriceBaisa + selectedOptions.reduce(0) { $0 + $1.priceDeltaBaisa }
    }
}

// MARK: - Cart

/// Merchant context kept with the cart (needed for checkout rules and the store-switch warning).
public struct CartMerchant: Codable, Hashable, Sendable, BilingualNamed {
    public var id: String
    public var slug: String
    public var nameEn: String
    public var nameAr: String
    public var logoUrl: String?
    public var brandColor: String?
    public var acceptsCod: Bool
    public var acceptsOnline: Bool
    public var minOrderBaisa: Int
    public var location: LatLng?

    public init(summary: MerchantSummary) {
        id = summary.id
        slug = summary.slug
        nameEn = summary.nameEn
        nameAr = summary.nameAr
        logoUrl = summary.logoUrl
        brandColor = summary.brandColor
        acceptsCod = summary.acceptsCod
        acceptsOnline = summary.acceptsOnline
        minOrderBaisa = summary.minOrderBaisa
        location = summary.location
    }
}

public struct CartLine: Codable, Hashable, Identifiable, Sendable, BilingualNamed {
    public var productId: String
    public var nameEn: String
    public var nameAr: String
    public var imageUrl: String?
    public var optionIds: [String]
    public var optionNamesEn: [String]
    public var optionNamesAr: [String]
    public var unitPriceBaisa: Int
    public var quantity: Int
    public var notes: String?
    public var maxQuantity: Int

    /// Same product + same options + same notes merge into one line.
    public var id: String {
        ([productId] + optionIds.sorted() + [notes ?? ""]).joined(separator: "|")
    }

    public var lineTotalBaisa: Int { unitPriceBaisa * quantity }

    public func optionsSummary(_ language: AppLanguage) -> String {
        (language == .ar ? optionNamesAr : optionNamesEn).joined(separator: "، ")
    }
}

/// Single-merchant cart. Adding an item from another merchant requires an explicit
/// `replace` (the UI asks the user first).
public struct Cart: Codable, Hashable, Sendable {
    public private(set) var merchant: CartMerchant?
    public private(set) var lines: [CartLine] = []

    public init() {}

    public enum AddResult: Equatable, Sendable {
        case added
        /// The cart holds items from another store; nothing was changed.
        case differentMerchant(currentMerchantId: String)
    }

    public var isEmpty: Bool { lines.isEmpty }
    public var itemCount: Int { lines.reduce(0) { $0 + $1.quantity } }
    public var subtotalBaisa: Int { lines.reduce(0) { $0 + $1.lineTotalBaisa } }

    public var meetsMinimumOrder: Bool {
        guard let m = merchant else { return false }
        return subtotalBaisa >= m.minOrderBaisa
    }

    public func wouldConflict(with merchantId: String) -> Bool {
        guard let m = merchant, !lines.isEmpty else { return false }
        return m.id != merchantId
    }

    @discardableResult
    public mutating func add(_ selection: ProductSelection, quantity: Int, notes: String?,
                             merchant newMerchant: CartMerchant, replacingOtherMerchant: Bool = false) -> AddResult {
        if wouldConflict(with: newMerchant.id) {
            guard replacingOtherMerchant else { return .differentMerchant(currentMerchantId: merchant!.id) }
            lines.removeAll()
        }
        merchant = newMerchant
        let trimmedNotes = notes?.trimmingCharacters(in: .whitespacesAndNewlines)
        let opts = selection.selectedOptions
        var line = CartLine(
            productId: selection.product.id,
            nameEn: selection.product.nameEn,
            nameAr: selection.product.nameAr,
            imageUrl: selection.product.imageUrl,
            optionIds: selection.selectedOptionIds,
            optionNamesEn: opts.map(\.nameEn),
            optionNamesAr: opts.map { $0.name(.ar) },
            unitPriceBaisa: selection.unitPriceBaisa,
            quantity: 0,
            notes: (trimmedNotes?.isEmpty ?? true) ? nil : trimmedNotes,
            maxQuantity: selection.product.maxQuantity
        )
        if let idx = lines.firstIndex(where: { $0.id == line.id }) {
            lines[idx].quantity = min(lines[idx].maxQuantity, lines[idx].quantity + quantity)
        } else {
            line.quantity = min(line.maxQuantity, max(1, quantity))
            lines.append(line)
        }
        return .added
    }

    public mutating func setQuantity(_ quantity: Int, forLine id: String) {
        guard let idx = lines.firstIndex(where: { $0.id == id }) else { return }
        if quantity <= 0 {
            lines.remove(at: idx)
        } else {
            lines[idx].quantity = min(lines[idx].maxQuantity, quantity)
        }
        if lines.isEmpty { merchant = nil }
    }

    public mutating func clear() {
        lines.removeAll()
        merchant = nil
    }

    /// Body for `POST /orders/quote` / `POST /orders`.
    public func orderInput(addressId: String?, dropoff: PlaceInput? = nil,
                           paymentMethod: PaymentMethod, notes: String? = nil) -> MarketplaceOrderInput? {
        guard let m = merchant, !lines.isEmpty else { return nil }
        return MarketplaceOrderInput(
            merchantId: m.id,
            items: lines.map { .init(productId: $0.productId, quantity: $0.quantity, optionIds: $0.optionIds, notes: $0.notes) },
            addressId: addressId,
            dropoff: addressId == nil ? dropoff : nil,
            paymentMethod: paymentMethod,
            notes: (notes?.isEmpty ?? true) ? nil : notes,
            source: "app"
        )
    }

    /// Payment methods the merchant accepts, online first.
    public var allowedPaymentMethods: [PaymentMethod] {
        guard let m = merchant else { return [] }
        var out: [PaymentMethod] = []
        if m.acceptsOnline { out.append(.online) }
        if m.acceptsCod { out.append(.cod) }
        return out
    }
}
