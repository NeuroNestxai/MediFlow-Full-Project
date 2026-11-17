import SwiftUI
import QabnahKit

struct CaptainHomeView: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var store: CaptainStore
    @EnvironmentObject var router: CaptainRouter

    var body: some View {
        NavigationStack(path: $router.homePath) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let p = store.profile {
                        CaptainStatusBanner(profile: p)
                        if p.status != .active { OnboardingChecklistCard(profile: p) }
                        onlineCard(p)
                    } else if case .failed(let e) = store.profileState {
                        ErrorStateView(error: e) { Task { await store.refreshProfile() } }
                    } else {
                        LoadingView().frame(height: 160)
                    }

                    if !store.activeDeliveries.isEmpty {
                        Text(lang.t("home.active_jobs")).font(.title3.bold())
                        ForEach(store.activeDeliveries) { d in
                            NavigationLink(value: CaptainRoute.delivery(d)) { ActiveJobCard(delivery: d) }
                                .buttonStyle(.plain)
                        }
                    }
                    InlineError(error: store.activeError)

                    if store.isOnline {
                        offersSection
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .refreshable {
                await store.refreshProfile()
                await store.refreshActive()
                if store.isOnline { await store.refreshOffers() }
            }
            .navigationTitle(lang.t("app.name_captain"))
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

    private func onlineCard(_ p: CaptainProfile) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: Binding(get: { store.isOnline }, set: { on in Task { await store.setOnline(on) } })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(lang.t(store.isOnline ? "home.online" : "home.offline")).font(.title2.bold())
                        .foregroundColor(store.isOnline ? Brand.success : .secondary)
                    Text(lang.t(store.isOnline ? "home.online_hint" : "home.offline_hint"))
                        .font(.footnote).foregroundColor(.secondary)
                }
            }
            .toggleStyle(SwitchToggleStyle(tint: Brand.success))
            .disabled(!p.canGoOnline || store.isTogglingOnline)
            if store.isTogglingOnline { ProgressView() }
            if !p.canGoOnline {
                Text(lang.t("home.not_active_hint")).font(.footnote).foregroundColor(.secondary)
            }
            InlineError(error: store.onlineError)
            if store.isOnline && store.location.authorization == .authorizedWhenInUse {
                Label(lang.t("home.always_location_hint"), systemImage: "location.circle")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
        .card()
    }

    private var offersSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(lang.t("home.offers")).font(.title3.bold())
            if store.offers.isEmpty {
                HStack(spacing: 10) {
                    ProgressView()
                    Text(lang.t("home.waiting_for_offers")).foregroundColor(.secondary)
                }
                .card()
            } else {
                ForEach(store.offers) { offer in
                    Button { store.showOffer(offer) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(offer.merchantName ?? lang.t("offer.parcel")).font(.headline)
                                Text("\(offer.pickupArea) → \(offer.dropoffArea)").font(.subheadline).foregroundColor(.secondary)
                            }
                            Spacer()
                            Text(lang.money(offer.earningBaisa)).font(.headline).foregroundColor(Brand.success)
                        }
                        .card()
                    }
                    .buttonStyle(.plain)
                }
            }
        }
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
            banner(icon: "doc.badge.plus", color: Brand.info, title: lang.t("status.pending_documents"),
                   message: lang.t("status.pending_documents_hint"))
        case .pendingReview:
            banner(icon: "hourglass", color: Brand.accent, title: lang.t("status.pending_review"),
                   message: lang.t("status.pending_review_hint"))
        case .rejected:
            banner(icon: "xmark.octagon", color: Brand.danger, title: lang.t("status.rejected"),
                   message: profile.rejectionReason ?? lang.t("status.rejected_hint"))
        case .suspended:
            banner(icon: "pause.circle", color: Brand.danger, title: lang.t("status.suspended"),
                   message: profile.rejectionReason ?? lang.t("status.suspended_hint"))
        case .unknown:
            EmptyView()
        }
    }

    private func banner(icon: String, color: Color, title: String, message: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).font(.title2).foregroundColor(color).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline)
                Text(message).font(.subheadline).foregroundColor(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding()
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: Brand.radiusMd))
        .accessibilityElement(children: .combine)
    }
}

struct OnboardingChecklistCard: View {
    @EnvironmentObject var lang: LanguageSettings
    @EnvironmentObject var session: SessionStore
    let profile: CaptainProfile

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(lang.t("onboarding.checklist")).font(.headline).padding(.bottom, 8)
            row(done: profile.missingDocuments.isEmpty, title: lang.t("onboarding.documents"),
                detail: profile.missingDocuments.isEmpty ? nil : lang.f("onboarding.missing_count", profile.missingDocuments.count)) {
                DocumentsView()
            }
            Divider()
            row(done: !profile.zoneIds.isEmpty, title: lang.t("onboarding.zones"), detail: nil) {
                ZonesView(api: session.api)
            }
            Divider()
            row(done: !profile.availability.isEmpty, title: lang.t("onboarding.availability"), detail: nil) {
                AvailabilityView()
            }
        }
        .card()
    }

    private func row<D: View>(done: Bool, title: String, detail: String?, @ViewBuilder destination: () -> D) -> some View {
        NavigationLink(destination: destination()) {
            HStack {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(done ? Brand.success : .secondary)
                    .accessibilityHidden(true)
                VStack(alignment: .leading) {
                    Text(title)
                    if let detail { Text(detail).font(.caption).foregroundColor(Brand.danger) }
                }
                Spacer()
                Image(systemName: "chevron.forward").font(.caption).foregroundColor(.secondary)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(done ? lang.t("common.done") : lang.t("common.todo"))
    }
}

struct ActiveJobCard: View {
    @EnvironmentObject var lang: LanguageSettings
    let delivery: CaptainDelivery

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(delivery.merchantName ?? lang.t("offer.parcel")).font(.headline)
                Spacer()
                StatusPill(text: lang.t("delivery.status.\(delivery.status.rawValue)"))
            }
            if let order = delivery.orderNumber {
                Text(verbatim: order).font(.caption.monospaced()).foregroundColor(.secondary)
            }
            if let target = delivery.currentTarget?.address {
                Label(target, systemImage: delivery.status.isBeforePickup ? "bag" : "house")
                    .font(.subheadline)
            }
            HStack {
                Text(lang.money(delivery.earningBaisa)).foregroundColor(Brand.success).bold()
                if delivery.codAmountBaisa > 0 {
                    Text(lang.f("job.collect_cod", lang.money(delivery.codAmountBaisa)))
                        .font(.caption.bold()).foregroundColor(Brand.accent)
                }
            }
        }
        .card()
        .accessibilityElement(children: .combine)
    }
}
