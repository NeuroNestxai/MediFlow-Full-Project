import SwiftUI
import MapKit
import QabnahKit

/// Incoming offer as a full-height sheet on night: a saffron countdown ring to `expiresAt`, the
/// earning as the big figure, pickup → drop-off rows, then accept (saffron) and decline.
struct OfferCardView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var store: CaptainStore
    @EnvironmentObject var router: CaptainRouter
    let offer: Offer
    @State private var showReject = false
    @State private var initialSeconds: Int = 0

    private static let rejectReasons = ["too_far", "busy", "vehicle_unsuitable", "low_earning", "other"]

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let remaining = offer.secondsRemaining(now: ctx.date)
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(spacing: QTheme.space4) {
                        OfferCountdownRing(remaining: remaining, total: max(initialSeconds, remaining, 1))
                        earning
                        OfferRouteCard(offer: offer)
                        mapPreview
                        errors
                    }
                    .padding(QTheme.space4)
                }
                actions(expired: remaining == 0)
            }
            .onChange(of: remaining == 0) { expired in
                if expired && store.respondingOfferId != offer.id { store.dismissOffer(offer) }
            }
        }
        .background(QTheme.background.ignoresSafeArea())
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

    private var header: some View {
        HStack {
            Text(lang.t("offer.new")).qFont(.h2).foregroundColor(QTheme.ink)
            Spacer()
            Button { store.dismissOffer(offer) } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(QTheme.ink)
                    .frame(width: 44, height: 44)
                    .background(QTheme.surface)
                    .clipShape(Circle())
            }
            .accessibilityLabel(lang.t("offer.later"))
            .accessibilityIdentifier("offer.hide")
        }
        .padding(.horizontal, QTheme.space4)
        .padding(.top, QTheme.space3)
    }

    private var earning: some View {
        VStack(spacing: 4) {
            Text(lang.t("offer.earning")).qFont(.small, .medium).foregroundColor(QTheme.muted)
            QPrice(baisa: offer.earningBaisa, style: .display)
            if offer.codAmountBaisa > 0 {
                Text(lang.f("job.collect_cod", lang.money(offer.codAmountBaisa)))
                    .qFont(.body, .semibold)
                    .foregroundColor(QTheme.warning)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var mapPreview: some View {
        let points = mapPoints
        if !points.isEmpty {
            RouteMapView(points: points, dashedFrom: points.first?.coordinate,
                         dashedTo: points.count > 1 ? points.last?.coordinate : nil, showsRecenterButton: false)
                .frame(height: 180)
                .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous))
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    private var mapPoints: [MapPoint] {
        var out: [MapPoint] = []
        if let p = offer.pickupLocation {
            out.append(MapPoint(id: "pickup", kind: .pickup, coordinate: CLLocationCoordinate2D(p), label: lang.t("job.pickup")))
        }
        if let d = offer.dropoffLocation {
            out.append(MapPoint(id: "dropoff", kind: .dropoff, coordinate: CLLocationCoordinate2D(d),
                                label: lang.t("job.dropoff_approx")))
        }
        return out
    }

    @ViewBuilder private var errors: some View {
        if let err = store.offerError {
            InlineError(error: err)
            if (err as? APIError)?.isConflict == true {
                Text(lang.t("offer.taken")).qFont(.small).foregroundColor(QTheme.muted)
            }
        }
    }

    private func actions(expired: Bool) -> some View {
        let busy = store.respondingOfferId == offer.id
        return QNightBar {
            HStack(spacing: QTheme.space3) {
                Button(lang.t("offer.reject")) { showReject = true }
                    .buttonStyle(SecondaryButtonStyle())
                    .frame(maxWidth: 130)
                    .disabled(busy || expired)
                    .accessibilityIdentifier("offer.decline")
                Button {
                    Task {
                        // Accepted: the cover closes and the active delivery opens on Home.
                        if let delivery = await store.accept(offer) { router.showDelivery(delivery) }
                    }
                } label: {
                    if busy { ProgressView().tint(QTheme.inkOnLight) } else { Text(lang.t("offer.accept")) }
                }
                .buttonStyle(SaffronButtonStyle())
                .disabled(busy || expired)
                .accessibilityIdentifier("offer.accept")
            }
        }
    }
}

/// Saffron ring that empties as the offer runs out, with the seconds in the middle.
private struct OfferCountdownRing: View {
    @EnvironmentObject var lang: LanguageSettings
    let remaining: Int
    let total: Int

    private var fraction: CGFloat {
        guard total > 0 else { return 0 }
        return min(1, max(0, CGFloat(remaining) / CGFloat(total)))
    }

    var body: some View {
        ZStack {
            Circle().stroke(QTheme.line, lineWidth: 8)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(remaining <= 10 ? QTheme.danger : QTheme.saffron, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 1), value: remaining)
            Text(lang.digits("\(remaining)"))
                .qFont(size: 34, .bold, relativeTo: .title, tabular: true)
                .foregroundColor(QTheme.ink)
        }
        .frame(width: 104, height: 104)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(lang.f("offer.seconds_left_a11y", remaining))
    }
}

/// Pickup → drop-off rows with the distances the server sent.
private struct OfferRouteCard: View {
    @EnvironmentObject var lang: LanguageSettings
    let offer: Offer

    var body: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            Label(offer.merchantName ?? lang.t("offer.parcel"),
                  systemImage: offer.merchantName == nil ? "shippingbox" : "bag")
                .qFont(.h3)
                .foregroundColor(QTheme.ink)
            stop(color: QTheme.primary, title: lang.t("job.pickup"), area: offer.pickupArea,
                 detail: lang.f("offer.to_pickup", lang.distance(offer.distanceToPickupM)))
            stop(color: QTheme.saffron, title: lang.t("job.dropoff"), area: offer.dropoffArea,
                 detail: lang.f("offer.trip", lang.distance(offer.tripDistanceM)))
            if let size = offer.packageSize {
                Label(lang.t("package.\(size)", fallback: size), systemImage: "shippingbox")
                    .qFont(.small)
                    .foregroundColor(QTheme.muted)
            }
            if let v = offer.vehicleType {
                Label(lang.t("vehicle.\(v)", fallback: v), systemImage: "car")
                    .qFont(.small)
                    .foregroundColor(QTheme.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private func stop(color: Color, title: String, area: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: QTheme.space3) {
            Circle().fill(color).frame(width: 12, height: 12).padding(.top, 5).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).qFont(.small, .medium).foregroundColor(QTheme.muted)
                Text(area).qFont(.h3).foregroundColor(QTheme.ink)
                Text(detail).qFont(.small).foregroundColor(QTheme.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
