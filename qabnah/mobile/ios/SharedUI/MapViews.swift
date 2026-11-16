import SwiftUI
import MapKit
import QabnahKit

struct MapPoint: Identifiable, Equatable {
    enum Kind: Equatable { case pickup, dropoff, captain, me }
    let id: String
    let kind: Kind
    let coordinate: CLLocationCoordinate2D
    var heading: Double?
    var label: String

    static func == (a: MapPoint, b: MapPoint) -> Bool {
        a.id == b.id && a.kind == b.kind && a.coordinate.latitude == b.coordinate.latitude
            && a.coordinate.longitude == b.coordinate.longitude && a.heading == b.heading
    }

    var systemImage: String {
        switch kind {
        case .pickup: return "bag.fill"
        case .dropoff: return "house.fill"
        case .captain: return "scooter"
        case .me: return "location.fill"
        }
    }

    var color: Color {
        switch kind {
        case .pickup: return Brand.accent
        case .dropoff: return Brand.primary
        case .captain: return Brand.info
        case .me: return Brand.info
        }
    }
}

extension MKCoordinateRegion {
    /// Region that shows every point with padding (Muscat when empty).
    static func fitting(_ coords: [CLLocationCoordinate2D], minSpan: Double = 0.01) -> MKCoordinateRegion {
        guard let first = coords.first else {
            return MKCoordinateRegion(center: CLLocationCoordinate2D(LatLng.muscat),
                                      span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15))
        }
        var minLat = first.latitude, maxLat = first.latitude
        var minLng = first.longitude, maxLng = first.longitude
        for c in coords {
            minLat = min(minLat, c.latitude); maxLat = max(maxLat, c.latitude)
            minLng = min(minLng, c.longitude); maxLng = max(maxLng, c.longitude)
        }
        let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2)
        let span = MKCoordinateSpan(latitudeDelta: max(minSpan, (maxLat - minLat) * 1.5),
                                    longitudeDelta: max(minSpan, (maxLng - minLng) * 1.5))
        return MKCoordinateRegion(center: center, span: span)
    }
}

/// Map with pickup / dropoff / captain annotations. Re-fits when the set of points changes,
/// and offers a recenter button.
struct PlacesMap: View {
    @EnvironmentObject var lang: LanguageSettings
    let points: [MapPoint]
    var showsUserLocation = false
    @State private var region: MKCoordinateRegion

    init(points: [MapPoint], showsUserLocation: Bool = false) {
        self.points = points
        self.showsUserLocation = showsUserLocation
        _region = State(initialValue: .fitting(points.map(\.coordinate)))
    }

    var body: some View {
        Map(coordinateRegion: $region, showsUserLocation: showsUserLocation, annotationItems: points) { p in
            MapAnnotation(coordinate: p.coordinate) {
                ZStack {
                    Circle().fill(p.color).frame(width: 36, height: 36).shadow(radius: 2)
                    Image(systemName: p.systemImage)
                        .foregroundColor(.white)
                }
                .accessibilityElement()
                .accessibilityLabel(p.label)
            }
        }
        .overlay(alignment: .topTrailing) {
            Button {
                withAnimation { region = .fitting(points.map(\.coordinate)) }
            } label: {
                Image(systemName: "scope")
                    .padding(10)
                    .background(.regularMaterial, in: Circle())
            }
            .padding(10)
            .accessibilityLabel(lang.t("map.recenter"))
        }
        .onChange(of: points.map(\.id)) { _ in
            withAnimation { region = .fitting(points.map(\.coordinate)) }
        }
    }
}

/// Full-screen "drop a pin" picker: the map moves under a fixed centre pin.
struct PinPickerView: View {
    @EnvironmentObject var lang: LanguageSettings
    @Environment(\.dismiss) var dismiss
    @StateObject private var location = LocationProvider()

    let title: String
    let onConfirm: (LatLng) -> Void
    @State private var region: MKCoordinateRegion

    init(title: String, initial: LatLng?, onConfirm: @escaping (LatLng) -> Void) {
        self.title = title
        self.onConfirm = onConfirm
        let center = initial ?? .muscat
        _region = State(initialValue: MKCoordinateRegion(
            center: CLLocationCoordinate2D(center),
            span: MKCoordinateSpan(latitudeDelta: initial == nil ? 0.08 : 0.01, longitudeDelta: initial == nil ? 0.08 : 0.01)))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Map(coordinateRegion: $region, showsUserLocation: location.isAuthorized)
                    .ignoresSafeArea(edges: .bottom)
                Image(systemName: "mappin")
                    .font(.system(size: 44, weight: .bold))
                    .foregroundColor(Brand.danger)
                    .offset(y: -22)
                    .accessibilityHidden(true)
            }
            .overlay(alignment: .bottom) {
                VStack(spacing: 10) {
                    Button {
                        Task {
                            if let loc = await location.currentLocation() {
                                withAnimation {
                                    region = MKCoordinateRegion(center: loc.coordinate,
                                                                span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01))
                                }
                            }
                        }
                    } label: {
                        Label(lang.t("map.use_my_location"), systemImage: "location.fill")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: Brand.radiusMd))

                    Button(lang.t("map.confirm_pin")) {
                        onConfirm(region.center.latLng)
                        dismiss()
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }
                .padding()
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(lang.t("common.cancel")) { dismiss() }
                }
            }
        }
    }
}
