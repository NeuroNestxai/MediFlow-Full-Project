import SwiftUI
import QabnahKit

/// Product options sheet: variants are radio buttons (minSelect/maxSelect honoured), add-ons are
/// checkboxes up to maxSelect; the price updates live (base + deltas) × quantity.
struct ProductSheet: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var cart: CartStore
    @Environment(\.dismiss) var dismiss

    let merchant: MerchantSummary
    let isOpen: Bool
    @State private var selection: ProductSelection
    @State private var quantity = 1
    @State private var notes = ""
    @State private var confirmReplace = false

    init(product: Product, merchant: MerchantSummary, isOpen: Bool) {
        self.merchant = merchant
        self.isOpen = isOpen
        _selection = State(initialValue: ProductSelection(product: product))
    }

    private var product: Product { selection.product }
    private var brand: Color { Color(hex: merchant.brandColor) ?? Brand.primary }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if product.imageUrl != nil {
                        RemoteImage(urlString: product.imageUrl)
                            .frame(height: 220)
                            .frame(maxWidth: .infinity)
                            .clipped()
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text(lang.name(product)).font(.title2.bold())
                        if let d = product.description(lang.language) {
                            Text(d).foregroundColor(.secondary)
                        }
                        Text(lang.money(product.basePriceBaisa)).font(.headline).foregroundColor(brand)
                    }
                    .padding(.horizontal)

                    ForEach(product.optionGroups) { group in
                        groupView(group)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(lang.t("product.notes")).font(.headline)
                        TextField(lang.t("product.notes_placeholder"), text: $notes, axis: .vertical)
                            .lineLimit(1...3)
                            .textFieldStyle(.roundedBorder)
                    }
                    .padding(.horizontal)

                    Stepper(value: $quantity, in: 1...max(1, product.maxQuantity)) {
                        Text(lang.f("product.quantity", quantity))
                    }
                    .padding(.horizontal)
                }
                .padding(.bottom, 100)
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 6) {
                    if !isOpen {
                        Text(lang.t("store.closed_cannot_order")).font(.footnote).foregroundColor(Brand.danger)
                    }
                    Button(action: addTapped) {
                        HStack {
                            Text(lang.t("product.add_to_cart"))
                            Spacer()
                            Text(lang.money(selection.unitPriceBaisa * quantity))
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle(color: brand))
                    .disabled(!selection.isValid || !isOpen)
                }
                .padding()
                .background(.bar)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel(lang.t("common.close"))
                }
            }
            .confirmationDialog(lang.t("cart.replace_title"), isPresented: $confirmReplace, titleVisibility: .visible) {
                Button(lang.t("cart.replace_confirm"), role: .destructive) { add(replacing: true) }
                Button(lang.t("common.cancel"), role: .cancel) {}
            } message: {
                Text(lang.f("cart.replace_message", cart.cart.merchant.map { lang.name($0) } ?? ""))
            }
        }
        .tint(brand)
        .presentationDetents([.large])
    }

    @ViewBuilder
    private func groupView(_ group: OptionGroup) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(lang.name(group)).font(.headline)
                Spacer()
                Text(requirementText(group))
                    .font(.caption)
                    .foregroundColor(selection.unsatisfiedGroups.contains(group) ? Brand.danger : .secondary)
            }
            ForEach(group.options) { option in
                Button {
                    selection.toggle(option, in: group)
                } label: {
                    HStack {
                        Image(systemName: icon(option, group))
                            .foregroundColor(selection.isSelected(option, in: group) ? brand : .secondary)
                            .accessibilityHidden(true)
                        Text(lang.name(option))
                        Spacer()
                        if option.priceDeltaBaisa != 0 {
                            Text((option.priceDeltaBaisa > 0 ? "+" : "") + lang.money(option.priceDeltaBaisa))
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!selection.canSelect(option, in: group))
                .opacity(selection.canSelect(option, in: group) ? 1 : 0.45)
                .accessibilityAddTraits(selection.isSelected(option, in: group) ? .isSelected : [])
            }
        }
        .padding(.horizontal)
    }

    private func icon(_ option: ProductOption, _ group: OptionGroup) -> String {
        let on = selection.isSelected(option, in: group)
        if group.kind == .variant { return on ? "largecircle.fill.circle" : "circle" }
        return on ? "checkmark.square.fill" : "square"
    }

    private func requirementText(_ g: OptionGroup) -> String {
        if g.kind == .variant {
            return g.minSelect > 0 ? lang.t("product.required") : lang.t("product.optional")
        }
        if g.minSelect > 0 { return lang.f("product.choose_between", g.minSelect, g.effectiveMax) }
        return lang.f("product.choose_up_to", g.effectiveMax)
    }

    private func addTapped() { add(replacing: false) }

    private func add(replacing: Bool) {
        let result = cart.add(selection, quantity: quantity, notes: notes, merchant: CartMerchant(summary: merchant),
                              replacing: replacing)
        switch result {
        case .added: dismiss()
        case .differentMerchant: confirmReplace = true
        }
    }
}
