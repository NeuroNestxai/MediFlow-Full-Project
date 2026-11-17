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
                    EmptyStateView(systemImage: "cart", title: lang.t("cart.empty"), message: lang.t("cart.empty_hint"))
                } else {
                    List {
                        if let m = cart.cart.merchant {
                            Section {
                                Label(lang.name(m), systemImage: "storefront")
                                    .font(.headline)
                                    .foregroundColor(Color(hex: m.brandColor) ?? Brand.primary)
                            }
                        }
                        Section {
                            ForEach(cart.cart.lines) { line in
                                CartLineRow(line: line)
                            }
                            .onDelete { idx in
                                idx.map { cart.cart.lines[$0].id }.forEach { cart.setQuantity(0, line: $0) }
                            }
                        }
                        Section {
                            KeyValueRow(label: lang.t("checkout.subtotal"), value: lang.money(cart.cart.subtotalBaisa), bold: true)
                            if let m = cart.cart.merchant, !cart.cart.meetsMinimumOrder {
                                Text(lang.f("cart.min_order_warning", lang.money(m.minOrderBaisa)))
                                    .font(.footnote)
                                    .foregroundColor(Brand.danger)
                            }
                        }
                    }
                    .safeAreaInset(edge: .bottom) {
                        checkoutButton
                    }
                }
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
                }
                if !cart.cart.isEmpty {
                    ToolbarItem(placement: .destructiveAction) {
                        Button(lang.t("cart.clear"), role: .destructive) { cart.clear() }
                    }
                }
            }
        }
    }
}

private extension CartView {
    var checkoutButton: some View {
        VStack(spacing: 6) {
            Button {
                if session.isSignedIn { showCheckout = true } else { showSignIn = true }
            } label: {
                Text(lang.t("cart.checkout"))
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!cart.cart.meetsMinimumOrder)
            if !session.isSignedIn {
                Text(lang.t("cart.sign_in_to_checkout")).font(.footnote).foregroundColor(.secondary)
            }
        }
        .padding()
        .background(.bar)
    }
}

struct CartLineRow: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var cart: CartStore
    let line: CartLine

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(lang.name(line)).font(.headline)
                    let opts = line.optionsSummary(lang.language)
                    if !opts.isEmpty { Text(opts).font(.caption).foregroundColor(.secondary) }
                    if let n = line.notes { Text(n).font(.caption).italic().foregroundColor(.secondary) }
                }
                Spacer()
                Text(lang.money(line.lineTotalBaisa)).font(.subheadline.bold())
            }
            Stepper(value: Binding(get: { line.quantity }, set: { cart.setQuantity($0, line: line.id) }),
                    in: 0...max(1, line.maxQuantity)) {
                Text(lang.f("product.quantity", line.quantity)).font(.subheadline)
            }
        }
    }
}
