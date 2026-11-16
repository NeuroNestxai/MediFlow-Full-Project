import SwiftUI
import MapKit
import QabnahKit

/// Full-screen incoming offer with a countdown to `expiresAt`.
struct OfferCardView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var store: CaptainStore
    let offer: Offer
    @State private var showReject = false
    @State private var initialSeconds: Int = 0

    private static let rejectReasons = ["too_far", "busy", "vehicle_unsuitable", "low_earning", "other"]

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let remaining = offer.secondsRemaining(now: ctx.date)
            VStack(spacing: 16) {
                header(remaining: remaining)
                ScrollView {
                    VStack(spacing: 14) {
                        mapPreview
                        amounts
                        route
                        if let err = store.offerError {
                            InlineError(error: err)
                            if (err as? APIError)?.isConflict == true {
                                Text(lang.t("offer.taken")).font(.footnote).foregroundColor(.secondary)
                            }
                        }
                    }
                    .padding(.horizontal)
                }
                actions(expired: remaining == 0)
            }
            .onChange(of: remaining == 0) { expired in
                if expired && store.respondingOfferId != offer.id { store.dismissOffer(offer) }
            }
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .onAppear {
            initialSeconds = max(1, offer.secondsRemaining())
            store.offerError = nil
        }
        .confirmationDialog(lang.t("offer.reject_title"), isPresented: $showReject, titleVisibility: .visible) {
            ForEach(Self.rejectReasons, id: \.self) { r in
                Button(lang.t("offer.reject_reason.\(r)")) { Task { await store.reject(offer, reason: r) } }
            }
            Button(lang.t("common.cancel"), role: .cancel) {}
        }
    }

    private func header(remaining: Int) -> some View {
        VStack(spacing: 8) {
            HStack {
                Text(lang.t("offer.new")).font(.title2.bold())
                Spacer()
                Button { store.dismissOffer(offer) } label: {
                    Image(systemName: "chevron.down").padding(8)
                }
                .accessibilityLabel(lang.t("offer.later"))
            }
            ProgressView(value: Double(remaining), total: Double(max(initialSeconds, remaining, 1)))
                .tint(remaining <= 10 ? Brand.danger : Brand.primary)
            Text(lang.f("offer.expires_in", Formatters.countdown(seconds: remaining, language: .en)))
                .font(.headline.monospacedDigit())
                .foregroundColor(remaining <= 10 ? Brand.danger : .primary)
                .accessibilityLabel(lang.f("offer.seconds_left_a11y", remaining))
        }
        .padding([.horizontal, .top])
    }

    private var mapPreview: some View {
        let points: [MapPoint] = [
            offer.pickupLocation.map { MapPoint(id: "pickup", kind: .pickup, coordinate: CLLocationCoordinate2D($0), label: lang.t("job.pickup")) },
            offer.dropoffLocation.map { MapPoint(id: "dropoff", kind: .dropoff, coordinate: CLLocationCoordinate2D($0), label: lang.t("job.dropoff_approx")) },
        ].compactMap { $0 }
        return Group {
            if !points.isEmpty {
                PlacesMap(points: points)
                    .frame(height: 200)
                    .clipShape(RoundedRectangle(cornerRadius: Brand.radiusMd))
                    .allowsHitTesting(false)
            }
        }
    }

    private var amounts: some View {
        HStack(spacing: 12) {
            stat(title: lang.t("offer.earning"), value: lang.money(offer.earningBaisa), color: Brand.success)
            if offer.codAmountBaisa > 0 {
                stat(title: lang.t("offer.cod"), value: lang.money(offer.codAmountBaisa), color: Brand.accent)
            }
        }
    }

    private var route: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let m = offer.merchantName {
                Label(m, systemImage: "storefront").font(.headline)
            } else {
                Label(lang.t("offer.parcel"), systemImage: "shippingbox").font(.headline)
            }
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(lang.t("job.pickup")).font(.caption).foregroundColor(.secondary)
                    Text(offer.pickupArea).font(.body.bold())
                    Text(lang.f("offer.to_pickup", lang.distance(offer.distanceToPickupM))).font(.caption).foregroundColor(.secondary)
                }
                Spacer()
                Image(systemName: "arrow.forward").foregroundColor(.secondary).accessibilityHidden(true)
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text(lang.t("job.dropoff")).font(.caption).foregroundColor(.secondary)
                    Text(offer.dropoffArea).font(.body.bold())
                    Text(lang.f("offer.trip", lang.distance(offer.tripDistanceM))).font(.caption).foregroundColor(.secondary)
                }
            }
            if let size = offer.packageSize {
                Label(lang.t("package.\(size)", fallback: size), systemImage: "shippingbox").font(.subheadline)
            }
            if let v = offer.vehicleType {
                Label(lang.t("vehicle.\(v)", fallback: v), systemImage: "car").font(.subheadline)
            }
        }
        .card()
    }

    private func stat(title: String, value: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(title).font(.caption).foregroundColor(.secondary)
            Text(value).font(.title3.bold()).foregroundColor(color)
        }
        .frame(maxWidth: .infinity)
        .card()
        .accessibilityElement(children: .combine)
    }

    private func actions(expired: Bool) -> some View {
        let busy = store.respondingOfferId == offer.id
        return HStack(spacing: 12) {
            Button(lang.t("offer.reject")) { showReject = true }
                .buttonStyle(SecondaryButtonStyle(color: Brand.danger))
                .disabled(busy || expired)
            Button {
                Task { _ = await store.accept(offer) }
            } label: {
                if busy { ProgressView().tint(.white) } else { Text(lang.t("offer.accept")) }
            }
            .buttonStyle(PrimaryButtonStyle(color: Brand.success))
            .disabled(busy || expired)
        }
        .padding()
        .background(.bar)
    }
}
