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

    var systemImage: String { Self.systemImage(for: kind) }

    static func systemImage(for kind: Kind) -> String {
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

// MARK: - Route map (MKMapView)

extension MapPoint.Kind {
    var uiColor: UIColor {
        switch self {
        case .pickup: return UIColor(Brand.accent)
        case .dropoff: return UIColor(Brand.primary)
        case .captain, .me: return UIColor(Brand.info)
        }
    }
}

/// Live route map (iOS 16 SwiftUI `Map` has no overlays, so this wraps `MKMapView`):
/// pickup / dropoff / captain markers, the captain's breadcrumb `path` as a solid line and a
/// dashed line from `dashedFrom` (captain) to `dashedTo` (next stop). Fits everything when the
/// set of markers changes; the scope button re-fits on demand.
struct RouteMapView: View {
    @EnvironmentObject var lang: LanguageSettings
    let points: [MapPoint]
    var path: [CLLocationCoordinate2D] = []
    var dashedFrom: CLLocationCoordinate2D? = nil
    var dashedTo: CLLocationCoordinate2D? = nil
    var showsUserLocation = false
    var showsRecenterButton = true
    @State private var fitRequest = 0

    var body: some View {
        RouteMapRepresentable(points: points, path: path, dashedFrom: dashedFrom, dashedTo: dashedTo,
                              showsUserLocation: showsUserLocation, fitRequest: fitRequest)
            .overlay(alignment: .topTrailing) {
                if showsRecenterButton {
                    Button {
                        fitRequest += 1
                    } label: {
                        Image(systemName: "scope")
                            .padding(10)
                            .background(.regularMaterial, in: Circle())
                    }
                    .padding(10)
                    .accessibilityLabel(lang.t("map.recenter"))
                }
            }
    }
}

/// `MKMapView` that runs a pending fit once it has a real size (the first `updateUIView`
/// happens before layout, when `setVisibleMapRect` would use a zero frame).
final class FittingMapView: MKMapView {
    var pendingFit: (() -> Void)?

    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.width > 1, bounds.height > 1, let fit = pendingFit {
            pendingFit = nil
            fit()
        }
    }
}

/// Marker for one `MapPoint`; `coordinate` is `dynamic` so moves animate.
final class RouteAnnotation: NSObject, MKAnnotation {
    let pointId: String
    let kind: MapPoint.Kind
    @objc dynamic var coordinate: CLLocationCoordinate2D
    var title: String?

    init(_ point: MapPoint) {
        pointId = point.id
        kind = point.kind
        coordinate = point.coordinate
        title = point.label
        super.init()
    }
}

struct RouteMapRepresentable: UIViewRepresentable {
    let points: [MapPoint]
    let path: [CLLocationCoordinate2D]
    let dashedFrom: CLLocationCoordinate2D?
    let dashedTo: CLLocationCoordinate2D?
    let showsUserLocation: Bool
    let fitRequest: Int

    static let pathTitle = "path"
    static let dashedTitle = "dashed"

    func makeCoordinator() -> RouteMapCoordinator { RouteMapCoordinator() }

    func makeUIView(context: Context) -> FittingMapView {
        let map = FittingMapView(frame: .zero)
        map.delegate = context.coordinator
        map.pointOfInterestFilter = .excludingAll
        map.showsCompass = false
        map.isRotateEnabled = false
        map.register(MKMarkerAnnotationView.self,
                     forAnnotationViewWithReuseIdentifier: MKMapViewDefaultAnnotationViewReuseIdentifier)
        return map
    }

    func updateUIView(_ map: FittingMapView, context: Context) {
        let coordinator = context.coordinator
        if map.showsUserLocation != showsUserLocation { map.showsUserLocation = showsUserLocation }
        syncAnnotations(map, coordinator)
        syncOverlays(map, coordinator)

        let key = points.map(\.id).sorted().joined(separator: ",")
        guard key != coordinator.fittedKey || fitRequest != coordinator.fitRequest else { return }
        let animated = !coordinator.fittedKey.isEmpty
        coordinator.fittedKey = key
        coordinator.fitRequest = fitRequest
        let coords = fitCoordinates
        if map.bounds.width > 1 && map.bounds.height > 1 {
            Self.fit(map, coords, animated: animated)
        } else {
            map.pendingFit = { [weak map] in
                if let map { Self.fit(map, coords, animated: false) }
            }
        }
    }

    private var fitCoordinates: [CLLocationCoordinate2D] {
        var coords = points.map(\.coordinate)
        coords.append(contentsOf: path)
        if let dashedFrom { coords.append(dashedFrom) }
        return coords
    }

    private func syncAnnotations(_ map: MKMapView, _ coordinator: RouteMapCoordinator) {
        var seen = Set<String>()
        for point in points {
            seen.insert(point.id)
            if let existing = coordinator.annotations[point.id], existing.kind == point.kind {
                existing.title = point.label
                let moved = existing.coordinate.latitude != point.coordinate.latitude
                    || existing.coordinate.longitude != point.coordinate.longitude
                if moved {
                    let target = point.coordinate
                    UIView.animate(withDuration: 0.6) { existing.coordinate = target }
                }
            } else {
                if let stale = coordinator.annotations[point.id] { map.removeAnnotation(stale) }
                let annotation = RouteAnnotation(point)
                coordinator.annotations[point.id] = annotation
                map.addAnnotation(annotation)
            }
        }
        for (id, annotation) in coordinator.annotations where !seen.contains(id) {
            map.removeAnnotation(annotation)
            coordinator.annotations[id] = nil
        }
    }

    private func syncOverlays(_ map: MKMapView, _ coordinator: RouteMapCoordinator) {
        var signature = "\(path.count)"
        if let last = path.last { signature += "|\(last.latitude),\(last.longitude)" }
        if let a = dashedFrom, let b = dashedTo { signature += "|\(a.latitude),\(a.longitude)>\(b.latitude),\(b.longitude)" }
        guard signature != coordinator.overlaySignature else { return }
        coordinator.overlaySignature = signature
        map.removeOverlays(map.overlays)
        if path.count > 1 {
            let line = MKPolyline(coordinates: path, count: path.count)
            line.title = Self.pathTitle
            map.addOverlay(line, level: .aboveRoads)
        }
        if let a = dashedFrom, let b = dashedTo {
            let ends = [a, b]
            let line = MKPolyline(coordinates: ends, count: ends.count)
            line.title = Self.dashedTitle
            map.addOverlay(line, level: .aboveRoads)
        }
    }

    static func fit(_ map: MKMapView, _ coords: [CLLocationCoordinate2D], animated: Bool) {
        guard let first = coords.first else {
            map.setRegion(.fitting([]), animated: animated)
            return
        }
        var rect = MKMapRect.null
        for c in coords {
            let p = MKMapPoint(c)
            rect = rect.union(MKMapRect(x: p.x, y: p.y, width: 0, height: 0))
        }
        // At least ~800 m across so a single point or a short hop isn't zoomed in to the street.
        let minSide = 800 * MKMapPointsPerMeterAtLatitude(first.latitude)
        if rect.size.width < minSide { rect = rect.insetBy(dx: -(minSide - rect.size.width) / 2, dy: 0) }
        if rect.size.height < minSide { rect = rect.insetBy(dx: 0, dy: -(minSide - rect.size.height) / 2) }
        map.setVisibleMapRect(rect, edgePadding: UIEdgeInsets(top: 56, left: 36, bottom: 36, right: 56), animated: animated)
    }
}

final class RouteMapCoordinator: NSObject, MKMapViewDelegate {
    var annotations: [String: RouteAnnotation] = [:]
    var overlaySignature = ""
    var fittedKey = ""
    var fitRequest = 0

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard let route = annotation as? RouteAnnotation else { return nil } // user location: system dot
        let view = mapView.dequeueReusableAnnotationView(withIdentifier: MKMapViewDefaultAnnotationViewReuseIdentifier,
                                                         for: annotation)
        if let marker = view as? MKMarkerAnnotationView {
            marker.markerTintColor = route.kind.uiColor
            marker.glyphImage = UIImage(systemName: MapPoint.systemImage(for: route.kind))
            marker.displayPriority = .required
            marker.titleVisibility = route.kind == .captain ? .hidden : .adaptive
            marker.accessibilityLabel = route.title
        }
        return view
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        guard let line = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
        let renderer = MKPolylineRenderer(polyline: line)
        renderer.lineCap = .round
        renderer.lineJoin = .round
        if line.title == RouteMapRepresentable.dashedTitle {
            renderer.strokeColor = UIColor(Brand.info).withAlphaComponent(0.8)
            renderer.lineWidth = 3
            renderer.lineDashPattern = [NSNumber(value: 2), NSNumber(value: 8)]
        } else {
            renderer.strokeColor = UIColor(Brand.primary)
            renderer.lineWidth = 5
        }
        return renderer
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
