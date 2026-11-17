import SwiftUI
import QabnahKit

struct CartView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var cart: CartStore
    @EnvironmentObject var session: SessionStore
    @Environment(\.dismiss) var dismiss
    @State private var showCheckout = false
    @State private var showSignIn = false
    let api: APIClient

    var body: some View {
        NavigationStack {
            Group {
                if cart.cart.isEmpty {
                    EmptyStateView(systemImage: "cart", title: lang.t("cart.empty"), message: lang.t("cart.empty_hint"),
                                   actionTitle: lang.t("common.close"), action: { dismiss() })
                } else {
                    lines
                }
            }
            .qScreen()
            .safeAreaInset(edge: .bottom) {
                if !cart.cart.isEmpty { checkoutBar }
            }
            .navigationDestination(isPresented: $showCheckout) {
                CheckoutView(api: api, cart: cart, onClose: { dismiss() })
            }
            // Guests sign in here (OTP sheet) and go straight on to checkout.
            .signInSheet(isPresented: $showSignIn, subtitleKey: "auth.subtitle_checkout") {
                showCheckout = true
            }
            .navigationTitle(lang.t("cart.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(lang.t("common.close")) { dismiss() }
                        .accessibilityIdentifier("cart.close")
                }
                if !cart.cart.isEmpty {
                    ToolbarItem(placement: .destructiveAction) {
                        Button(lang.t("cart.clear"), role: .destructive) { cart.clear() }
                    }
                }
            }
        }
        .qSheet()
    }

    private var lines: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: QTheme.space4) {
                if let m = cart.cart.merchant {
                    HStack(spacing: QTheme.space3) {
                        QLogoChip(urlString: m.logoUrl, name: lang.name(m),
                                  brand: Color(hex: m.brandColor) ?? QTheme.primary, size: 44)
                        Text(lang.name(m)).qFont(.h3).foregroundColor(QTheme.ink)
                        Spacer(minLength: 0)
                    }
                }
                VStack(spacing: 0) {
                    ForEach(cart.cart.lines) { line in
                        CartLineRow(line: line)
                        if line.id != cart.cart.lines.last?.id {
                            Rectangle().fill(QTheme.line).frame(height: 1)
                        }
                    }
                }
                .card()
                if let m = cart.cart.merchant, !cart.cart.meetsMinimumOrder {
                    Text(lang.f("cart.min_order_warning", lang.money(m.minOrderBaisa)))
                        .qFont(.small)
                        .foregroundColor(QTheme.danger)
                }
            }
            .padding(QTheme.space4)
        }
    }

    private var checkoutBar: some View {
        QNightBar {
            HStack(spacing: QTheme.space3) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(lang.t("checkout.subtotal")).qFont(.small).foregroundColor(QTheme.muted)
                    QPrice(baisa: cart.cart.subtotalBaisa, style: .h3)
                }
                Spacer(minLength: QTheme.space2)
                Button {
                    if session.isSignedIn { showCheckout = true } else { showSignIn = true }
                } label: {
                    Text(lang.t("cart.checkout"))
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!cart.cart.meetsMinimumOrder)
                .frame(maxWidth: 220)
                .accessibilityIdentifier("cart.checkout")
            }
            if !session.isSignedIn {
                Text(lang.t("cart.sign_in_to_checkout"))
                    .qFont(.small)
                    .foregroundColor(QTheme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

struct CartLineRow: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var cart: CartStore
    let line: CartLine

    private var quantity: Binding<Int> {
        Binding(get: { line.quantity }, set: { cart.setQuantity($0, line: line.id) })
    }

    var body: some View {
        HStack(alignment: .top, spacing: QTheme.space3) {
            QPhoto(urlString: line.imageUrl, glyph: "bag")
                .frame(width: 72, height: 54)
                .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusSm, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(lang.name(line)).qFont(.body, .semibold).foregroundColor(QTheme.ink)
                if !line.optionsSummary(lang.language).isEmpty {
                    Text(line.optionsSummary(lang.language)).qFont(.small).foregroundColor(QTheme.muted)
                }
                if let n = line.notes, !n.isEmpty {
                    Text(n).qFont(.small).foregroundColor(QTheme.muted)
                }
                HStack {
                    QPrice(baisa: line.lineTotalBaisa)
                    Spacer(minLength: 0)
                    QStepper(value: quantity, range: 0...max(1, line.maxQuantity),
                             label: lang.f("product.quantity", line.quantity))
                }
            }
        }
        .padding(.vertical, QTheme.space3)
    }
}
