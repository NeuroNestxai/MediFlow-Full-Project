import SwiftUI
import QabnahKit

/// Product sheet: large photo (16:10), option rows (variants are radio buttons with
/// minSelect/maxSelect honoured, add-ons are checkboxes up to maxSelect), stepper, and a sticky
/// add bar whose price updates live: (base + deltas) × quantity.
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
    private var brand: Color { Color(hex: merchant.brandColor) ?? QTheme.primary }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: QTheme.space5) {
                QPhotoBox(urlString: product.imageUrl, aspect: 16.0 / 10.0, radius: 0,
                          glyph: (merchant.category ?? .other).glyph, tint: brand)
                titleBlock
                ForEach(product.optionGroups) { group in
                    groupView(group)
                }
                notesBlock
            }
            .padding(.bottom, QTheme.space6)
        }
        .background(QTheme.background.ignoresSafeArea())
        .overlay(alignment: .topTrailing) {
            Button { dismiss() } label: { QCircleIcon(systemImage: "xmark") }
                .padding(QTheme.space4)
                .accessibilityLabel(lang.t("common.close"))
                .accessibilityIdentifier("product.close")
        }
        .safeAreaInset(edge: .bottom) { addBar }
        .confirmationDialog(lang.t("cart.replace_title"), isPresented: $confirmReplace, titleVisibility: .visible) {
            Button(lang.t("cart.replace_confirm"), role: .destructive) { add(replacing: true) }
            Button(lang.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(lang.f("cart.replace_message", cart.cart.merchant.map { lang.name($0) } ?? ""))
        }
        .presentationDetents([.large])
        .qSheet()
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(lang.name(product)).qFont(.h2).foregroundColor(QTheme.ink)
            if let d = product.description(lang.language) {
                Text(d).qFont(.body).foregroundColor(QTheme.muted)
            }
            QPrice(baisa: product.basePriceBaisa, style: .h3)
        }
        .padding(.horizontal, QTheme.space4)
    }

    private var notesBlock: some View {
        VStack(alignment: .leading, spacing: QTheme.space2) {
            Text(lang.t("product.notes")).qFont(.h3).foregroundColor(QTheme.ink)
            TextField(lang.t("product.notes_placeholder"), text: $notes, axis: .vertical)
                .lineLimit(1...3)
                .padding(.vertical, QTheme.space2)
                .qField()
        }
        .padding(.horizontal, QTheme.space4)
    }

    private var addBar: some View {
        VStack(spacing: QTheme.space2) {
            if !isOpen {
                Text(lang.t("store.closed_cannot_order")).qFont(.small).foregroundColor(QTheme.danger)
            }
            HStack(spacing: QTheme.space3) {
                QStepper(value: $quantity, range: 1...max(1, product.maxQuantity),
                         label: lang.f("product.quantity", quantity))
                Button(action: addTapped) {
                    HStack {
                        Text(lang.t("product.add_to_cart"))
                        Spacer(minLength: QTheme.space2)
                        Text(lang.money(selection.unitPriceBaisa * quantity)).monospacedDigit()
                    }
                }
                .buttonStyle(PrimaryButtonStyle(color: brand))
                .disabled(!selection.isValid || !isOpen)
                .accessibilityIdentifier("product.add")
            }
        }
        .padding(.horizontal, QTheme.space4)
        .padding(.vertical, QTheme.space3)
        .background(QTheme.surface.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(QTheme.line).frame(height: 1) }
    }

    private func groupView(_ group: OptionGroup) -> some View {
        VStack(alignment: .leading, spacing: QTheme.space2) {
            HStack(alignment: .firstTextBaseline) {
                Text(lang.name(group)).qFont(.h3).foregroundColor(QTheme.ink)
                Spacer()
                Text(requirementText(group))
                    .qFont(.small, .medium)
                    .foregroundColor(selection.unsatisfiedGroups.contains(group) ? QTheme.danger : QTheme.muted)
            }
            ForEach(group.options) { option in
                optionRow(option, group)
            }
        }
        .padding(.horizontal, QTheme.space4)
    }

    private func optionRow(_ option: ProductOption, _ group: OptionGroup) -> some View {
        let selected = selection.isSelected(option, in: group)
        let enabled = selection.canSelect(option, in: group)
        return Button {
            selection.toggle(option, in: group)
        } label: {
            QChoiceRow(selected: selected, multiple: group.kind != .variant) {
                Text(lang.name(option)).qFont(.body).foregroundColor(QTheme.ink)
                Spacer(minLength: QTheme.space2)
                if option.priceDeltaBaisa != 0 {
                    Text((option.priceDeltaBaisa > 0 ? "+" : "") + lang.money(option.priceDeltaBaisa))
                        .qFont(.small, tabular: true)
                        .foregroundColor(QTheme.muted)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("option.\(option.nameEn)")
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
