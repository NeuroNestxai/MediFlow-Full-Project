import SwiftUI
import MapKit
import QabnahKit

/// Map-first home on the night surface: the map leads, and the panel below carries the giant
/// online control, today's earnings, active jobs and waiting offers.
struct CaptainHomeView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var store: CaptainStore
    @EnvironmentObject var router: CaptainRouter

    var body: some View {
        NavigationStack(path: $router.homePath) {
            GeometryReader { geo in
                VStack(spacing: 0) {
                    CaptainHomeMap(location: store.location, deliveries: store.activeDeliveries)
                        .frame(height: max(220, geo.size.height * 0.38))
                    panel
                }
            }
            .background(QTheme.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: CaptainRoute.self) { route in
                destination(route)
            }
            .alert(lang.t("home.location_needed_title"), isPresented: $store.needsLocationPermission) {
                Button(lang.t("common.open_settings")) {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
                Button(lang.t("common.cancel"), role: .cancel) {}
            } message: {
                Text(lang.t("home.location_needed_message"))
            }
        }
    }

    private var panel: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: QTheme.space4) {
                profileBlock
                if !store.activeDeliveries.isEmpty { activeJobs }
                InlineError(error: store.activeError)
                if store.isOnline { offersSection }
            }
            .padding(QTheme.space4)
        }
        .refreshable {
            await store.refreshProfile()
            await store.refreshActive()
            await store.refreshToday()
            if store.isOnline { await store.refreshOffers() }
        }
        .background(QTheme.background)
        .clipShape(QTopRoundedShape(radius: QTheme.radiusLg))
        .padding(.top, -QTheme.radiusLg)
    }

    @ViewBuilder private var profileBlock: some View {
        if let p = store.profile {
            CaptainStatusBanner(profile: p)
            OnlineControl(profile: p)
            TodayStrip(earnings: store.today)
            if p.status != .active { OnboardingChecklistCard(profile: p) }
        } else if case .failed(let e) = store.profileState {
            ErrorStateView(error: e) { Task { await store.refreshProfile() } }
        } else {
            LoadingView(rows: 2).frame(height: 160)
        }
    }

    private var activeJobs: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            QSectionTitle(text: lang.t("home.active_jobs"))
            ForEach(store.activeDeliveries) { d in
                NavigationLink(value: CaptainRoute.delivery(d)) { ActiveJobCard(delivery: d) }
                    .buttonStyle(.plain)
            }
        }
    }

    private var offersSection: some View {
        VStack(alignment: .leading, spacing: QTheme.space3) {
            QSectionTitle(text: lang.t("home.offers"))
            if store.offers.isEmpty {
                HStack(spacing: QTheme.space3) {
                    Circle().fill(QTheme.saffron).frame(width: 8, height: 8).accessibilityHidden(true)
                    Text(lang.t("home.waiting_for_offers")).qFont(.body).foregroundColor(QTheme.muted)
                    Spacer(minLength: 0)
                }
                .card()
            } else {
                ForEach(store.offers) { offer in
                    Button { store.showOffer(offer) } label: { OfferSummaryRow(offer: offer) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private func destination(_ route: CaptainRoute) -> some View {
        switch route {
        case .delivery(let d):
            ActiveDeliveryView(api: session.api, store: store, delivery: d)
        case .deliveryId(let id):
            DeliveryByIdView(deliveryId: id)
        case .ticket(let id):
            TicketDetailView(api: session.api, ticketId: id)
        case .documents:
            DocumentsView()
        }
    }
}

/// Dark map with the captain's position and the stops of the current job.
private struct CaptainHomeMap: View {
    @EnvironmentObject var lang: LanguageSettings
    @ObservedObject var location: CaptainLocationService
    let deliveries: [CaptainDelivery]

    private var points: [MapPoint] {
        guard let d = deliveries.first else { return [] }
        var out: [MapPoint] = []
        if let p = d.pickup?.location {
            out.append(MapPoint(id: "pickup", kind: .pickup, coordinate: CLLocationCoordinate2D(p), label: lang.t("job.pickup")))
        }
        if let p = d.dropoff?.location {
            out.append(MapPoint(id: "dropoff", kind: .dropoff, coordinate: CLLocationCoordinate2D(p), label: lang.t("job.dropoff")))
        }
        return out
    }

    var body: some View {
        RouteMapView(points: points, showsUserLocation: location.isAuthorized,
                     focus: location.lastLocation?.coordinate)
            .ignoresSafeArea(edges: .top)
    }
}

/// The giant online / offline control. Offline it is the screen's one saffron action; online it
/// becomes a calm surface with a live dot.
private struct OnlineControl: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var store: CaptainStore
    let profile: CaptainProfile

    private var online: Bool { store.isOnline }

    var body: some View {
        VStack(alignment: .leading, spacing: QTheme.space2) {
            Button {
                Task { await store.setOnline(!store.isOnline) }
            } label: {
                label
            }
            .buttonStyle(.plain)
            .disabled(!profile.canGoOnline || store.isTogglingOnline)
            .opacity(profile.canGoOnline ? 1 : 0.5)
            .accessibilityLabel(lang.t(online ? "home.online" : "home.go_online"))
            .accessibilityHint(lang.t(online ? "home.go_offline" : "home.offline_hint"))
            .accessibilityIdentifier("captain.onlineToggle")

            if !profile.canGoOnline {
                Text(lang.t("home.not_active_hint")).qFont(.small).foregroundColor(QTheme.muted)
            }
            InlineError(error: store.onlineError)
            if online && store.location.authorization == .authorizedWhenInUse {
                Label(lang.t("home.always_location_hint"), systemImage: "location.circle")
                    .qFont(.small)
                    .foregroundColor(QTheme.muted)
            }
        }
    }

    private var label: some View {
        HStack(spacing: QTheme.space4) {
            ZStack {
                Circle().fill(online ? QTheme.success.opacity(0.18) : QTheme.inkOnLight.opacity(0.12))
                if store.isTogglingOnline {
                    ProgressView().tint(online ? QTheme.success : QTheme.inkOnLight)
                } else {
                    Image(systemName: "power")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundColor(online ? QTheme.success : QTheme.inkOnLight)
                }
            }
            .frame(width: 64, height: 64)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(lang.t(online ? "home.online" : "home.go_online"))
                    .qFont(.h2)
                    .foregroundColor(online ? QTheme.ink : QTheme.inkOnLight)
                Text(lang.t(online ? "home.go_offline" : "home.offline_hint"))
                    .qFont(.small)
                    .foregroundColor(online ? QTheme.muted : QTheme.inkOnLight.opacity(0.75))
            }
            Spacer(minLength: 0)
        }
        .padding(QTheme.space5)
        .frame(maxWidth: .infinity, minHeight: 104, alignment: .leading)
        .background(online ? QTheme.surface : QTheme.saffron)
        .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusLg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: QTheme.radiusLg, style: .continuous)
            .stroke(online ? QTheme.line : Color.clear, lineWidth: 1))
    }
}

/// Today's earnings and delivery count.
private struct TodayStrip: View {
    @EnvironmentObject var lang: LanguageSettings
    let earnings: Earnings?

    var body: some View {
        HStack(spacing: 0) {
            stat(title: lang.t("earnings.earned")) {
                if let e = earnings {
                    QPrice(baisa: e.earningsBaisa, style: .h2)
                } else {
                    QSkeleton(width: 90, height: 22)
                }
            }
            Rectangle().fill(QTheme.line).frame(width: 1, height: 36)
            stat(title: lang.t("earnings.deliveries")) {
                if let e = earnings {
                    Text(lang.digits("\(e.deliveriesCount)")).qFont(.h2, tabular: true).foregroundColor(QTheme.ink)
                } else {
                    QSkeleton(width: 40, height: 22)
                }
            }
        }
        .card()
        .overlay(alignment: .topLeading) {
            Text(lang.t("earnings.preset.today"))
                .qFont(.micro, .semibold)
                .foregroundColor(QTheme.muted)
                .padding(.horizontal, QTheme.space4)
                .padding(.top, 6)
        }
        .accessibilityElement(children: .combine)
    }

    private func stat<Value: View>(title: String, @ViewBuilder value: () -> Value) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).qFont(.small).foregroundColor(QTheme.muted)
            value()
        }
        .padding(.top, QTheme.space2)
        .padding(.horizontal, QTheme.space2)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// One waiting offer in the Home list (tap to open the full offer).
private struct OfferSummaryRow: View {
    @EnvironmentObject var lang: LanguageSettings
    let offer: Offer

    var body: some View {
        HStack(spacing: QTheme.space3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(offer.merchantName ?? lang.t("offer.parcel")).qFont(.h3).foregroundColor(QTheme.ink)
                Text(verbatim: "\(offer.pickupArea) → \(offer.dropoffArea)")
                    .qFont(.small)
                    .foregroundColor(QTheme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: QTheme.space2)
            QPrice(baisa: offer.earningBaisa, style: .h3)
        }
        .card()
        .accessibilityElement(children: .combine)
    }
}

struct CaptainStatusBanner: View {
    @EnvironmentObject var lang: LanguageSettings
    let profile: CaptainProfile

    var body: some View {
        switch profile.status {
        case .active:
            EmptyView()
        case .pendingDocuments:
            banner(icon: "doc.badge.plus", color: QTheme.info, title: lang.t("status.pending_documents"),
                   message: lang.t("status.pending_documents_hint"))
        case .pendingReview:
            banner(icon: "hourglass", color: QTheme.warning, title: lang.t("status.pending_review"),
                   message: lang.t("status.pending_review_hint"))
        case .rejected:
            banner(icon: "xmark.octagon", color: QTheme.danger, title: lang.t("status.rejected"),
                   message: profile.rejectionReason ?? lang.t("status.rejected_hint"))
        case .suspended:
            banner(icon: "pause.circle", color: QTheme.danger, title: lang.t("status.suspended"),
                   message: profile.rejectionReason ?? lang.t("status.suspended_hint"))
        case .unknown:
            EmptyView()
        }
    }

    private func banner(icon: String, color: Color, title: String, message: String) -> some View {
        HStack(alignment: .top, spacing: QTheme.space3) {
            Image(systemName: icon).font(.system(size: 20, weight: .semibold)).foregroundColor(color).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).qFont(.h3).foregroundColor(QTheme.ink)
                Text(message).qFont(.small).foregroundColor(QTheme.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(QTheme.space4)
        .background(color.opacity(0.14))
        .clipShape(RoundedRectangle(cornerRadius: QTheme.radiusMd, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// Onboarding checklist: documents, zones and availability, each with its state.
struct OnboardingChecklistCard: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    let profile: CaptainProfile

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(lang.t("onboarding.checklist")).qFont(.h3).foregroundColor(QTheme.ink).padding(.bottom, QTheme.space2)
            row(done: profile.missingDocuments.isEmpty, title: lang.t("onboarding.documents"),
                detail: profile.missingDocuments.isEmpty ? nil : lang.f("onboarding.missing_count", profile.missingDocuments.count)) {
                DocumentsView()
            }
            Rectangle().fill(QTheme.line).frame(height: 1)
            row(done: !profile.zoneIds.isEmpty, title: lang.t("onboarding.zones"), detail: nil) {
                ZonesView(api: session.api)
            }
            Rectangle().fill(QTheme.line).frame(height: 1)
            row(done: !profile.availability.isEmpty, title: lang.t("onboarding.availability"), detail: nil) {
                AvailabilityView()
            }
        }
        .card()
    }

    private func row<D: View>(done: Bool, title: String, detail: String?, @ViewBuilder destination: () -> D) -> some View {
        NavigationLink(destination: destination()) {
            HStack(spacing: QTheme.space3) {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundColor(done ? QTheme.success : QTheme.muted)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).qFont(.body, .semibold).foregroundColor(QTheme.ink)
                    if let detail { Text(detail).qFont(.small).foregroundColor(QTheme.danger) }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward").font(.system(size: 13, weight: .semibold)).foregroundColor(QTheme.muted)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(done ? lang.t("common.done") : lang.t("common.todo"))
    }
}

/// Active job card: where the captain is heading next, the status and what the job pays.
struct ActiveJobCard: View {
    @EnvironmentObject var lang: LanguageSettings
    let delivery: CaptainDelivery

    var body: some View {
        VStack(alignment: .leading, spacing: QTheme.space2) {
            HStack {
                Text(delivery.merchantName ?? lang.t("offer.parcel")).qFont(.h3).foregroundColor(QTheme.ink).lineLimit(1)
                Spacer(minLength: QTheme.space2)
                StatusPill(text: lang.t("delivery.status.\(delivery.status.rawValue)"), color: QTheme.saffron)
            }
            if let order = delivery.orderNumber {
                Text(verbatim: order).qFont(.small, tabular: true).foregroundColor(QTheme.muted)
            }
            if let target = delivery.currentTarget?.address {
                Label(target, systemImage: delivery.status.isBeforePickup ? "bag" : "mappin.and.ellipse")
                    .qFont(.body)
                    .foregroundColor(QTheme.ink)
                    .lineLimit(2)
            }
            HStack(spacing: QTheme.space3) {
                QPrice(baisa: delivery.earningBaisa)
                if delivery.codAmountBaisa > 0 {
                    Text(lang.f("job.collect_cod", lang.money(delivery.codAmountBaisa)))
                        .qFont(.small, .semibold)
                        .foregroundColor(QTheme.warning)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
        .accessibilityElement(children: .combine)
    }
}
