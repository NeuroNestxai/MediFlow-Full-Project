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

// MARK: - Route map (MKMapView)

/// Marker images drawn once (design system "Maps": drop-off = saffron dot, captain = white dot
/// with a heading wedge; the pickup is a green pin).
enum RouteMapImages {
    static let dropoff: UIImage = {
        let size = CGSize(width: 24, height: 24)
        return UIGraphicsImageRenderer(size: size).image { context in
            let c = context.cgContext
            let rect = CGRect(origin: .zero, size: size).insetBy(dx: 1, dy: 1)
            UIColor.white.setFill()
            c.fillEllipse(in: rect)
            QUIColor.saffron.setFill()
            c.fillEllipse(in: rect.insetBy(dx: 3, dy: 3))
        }
    }()

    /// Points "up"; the annotation view is rotated to the captain's heading.
    static let captain: UIImage = {
        let size = CGSize(width: 36, height: 36)
        return UIGraphicsImageRenderer(size: size).image { context in
            let c = context.cgContext
            c.move(to: CGPoint(x: 18, y: 1))
            c.addLine(to: CGPoint(x: 26, y: 13))
            c.addLine(to: CGPoint(x: 10, y: 13))
            c.closePath()
            QUIColor.saffron.setFill()
            c.fillPath()
            let circle = CGRect(x: 7, y: 7, width: 22, height: 22)
            QUIColor.night.setFill()
            c.fillEllipse(in: circle)
            UIColor.white.setFill()
            c.fillEllipse(in: circle.insetBy(dx: 2.5, dy: 2.5))
        }
    }()
}

/// Live route map (iOS 16 SwiftUI `Map` has no overlays, so this wraps `MKMapView`): pickup pin,
/// drop-off dot and captain dot, the captain's breadcrumb `path` as a 4 pt saffron line with a
/// white casing, and a dashed line from `dashedFrom` (captain) to `dashedTo` (next stop). Muted
/// tiles; dark tiles in the captain app (dark scheme). Fits everything when the set of markers
/// changes; the scope button re-fits on demand.
struct RouteMapView: View {
    @EnvironmentObject var lang: LanguageSettings
    let points: [MapPoint]
    var path: [CLLocationCoordinate2D] = []
    var dashedFrom: CLLocationCoordinate2D? = nil
    var dashedTo: CLLocationCoordinate2D? = nil
    var showsUserLocation = false
    var showsRecenterButton = true
    /// Extra coordinate to keep in view (e.g. the captain's own position when there are no markers).
    var focus: CLLocationCoordinate2D? = nil
    @State private var fitRequest = 0

    var body: some View {
        RouteMapRepresentable(points: points, path: path, dashedFrom: dashedFrom, dashedTo: dashedTo,
                              showsUserLocation: showsUserLocation, focus: focus, fitRequest: fitRequest)
            .overlay(alignment: .topTrailing) {
                if showsRecenterButton {
                    Button {
                        fitRequest += 1
                    } label: {
                        QCircleIcon(systemImage: "scope", size: 40)
                    }
                    .padding(QTheme.space3)
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
    var heading: Double?

    init(_ point: MapPoint) {
        pointId = point.id
        kind = point.kind
        coordinate = point.coordinate
        title = point.label
        heading = point.heading
        super.init()
    }
}

struct RouteMapRepresentable: UIViewRepresentable {
    let points: [MapPoint]
    let path: [CLLocationCoordinate2D]
    let dashedFrom: CLLocationCoordinate2D?
    let dashedTo: CLLocationCoordinate2D?
    let showsUserLocation: Bool
    let focus: CLLocationCoordinate2D?
    let fitRequest: Int

    static let casingTitle = "casing"
    static let pathTitle = "path"
    static let dashedTitle = "dashed"
    static let pinReuseId = "qabnah.pin"
    static let dotReuseId = "qabnah.dot"

    func makeCoordinator() -> RouteMapCoordinator { RouteMapCoordinator() }

    func makeUIView(context: Context) -> FittingMapView {
        let map = FittingMapView(frame: .zero)
        map.delegate = context.coordinator
        let configuration = MKStandardMapConfiguration()
        configuration.emphasisStyle = .muted
        configuration.pointOfInterestFilter = .excludingAll
        map.preferredConfiguration = configuration
        map.showsCompass = false
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.register(MKMarkerAnnotationView.self, forAnnotationViewWithReuseIdentifier: Self.pinReuseId)
        map.register(MKAnnotationView.self, forAnnotationViewWithReuseIdentifier: Self.dotReuseId)
        return map
    }

    func updateUIView(_ map: FittingMapView, context: Context) {
        let coordinator = context.coordinator
        if map.showsUserLocation != showsUserLocation { map.showsUserLocation = showsUserLocation }
        syncAnnotations(map, coordinator)
        syncOverlays(map, coordinator)

        let key = points.map(\.id).sorted().joined(separator: ",") + (focus == nil ? "" : "|focus")
        guard key != coordinator.fittedKey || fitRequest != coordinator.fitRequest else { return }
        let animated = coordinator.fittedKey != nil
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
        if let focus { coords.append(focus) }
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
                if existing.heading != point.heading {
                    existing.heading = point.heading
                    if let view = map.view(for: existing) { RouteMapCoordinator.rotate(view, heading: point.heading) }
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
        if let a = dashedFrom, let b = dashedTo {
            let ends = [a, b]
            let line = MKPolyline(coordinates: ends, count: ends.count)
            line.title = Self.dashedTitle
            map.addOverlay(line, level: .aboveRoads)
        }
        if path.count > 1 {
            // White casing first, the saffron line on top of it.
            let casing = MKPolyline(coordinates: path, count: path.count)
            casing.title = Self.casingTitle
            map.addOverlay(casing, level: .aboveRoads)
            let line = MKPolyline(coordinates: path, count: path.count)
            line.title = Self.pathTitle
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
        map.setVisibleMapRect(rect, edgePadding: UIEdgeInsets(top: 64, left: 40, bottom: 48, right: 56), animated: animated)
    }
}

final class RouteMapCoordinator: NSObject, MKMapViewDelegate {
    var annotations: [String: RouteAnnotation] = [:]
    var overlaySignature = ""
    /// Nil until the first fit, so an empty map still gets its initial region.
    var fittedKey: String? = nil
    var fitRequest = 0

    static func rotate(_ view: MKAnnotationView, heading: Double?) {
        let radians = CGFloat((heading ?? 0) * Double.pi / 180)
        view.transform = CGAffineTransform(rotationAngle: radians)
    }

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard let route = annotation as? RouteAnnotation else { return nil } // user location: system dot
        if route.kind == .pickup {
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: RouteMapRepresentable.pinReuseId,
                                                             for: annotation)
            if let marker = view as? MKMarkerAnnotationView {
                marker.markerTintColor = QUIColor.primary
                marker.glyphImage = UIImage(systemName: "bag.fill")
                marker.displayPriority = .required
                marker.titleVisibility = .adaptive
            }
            view.accessibilityLabel = route.title
            return view
        }
        let view = mapView.dequeueReusableAnnotationView(withIdentifier: RouteMapRepresentable.dotReuseId,
                                                         for: annotation)
        view.displayPriority = .required
        view.canShowCallout = false
        view.isAccessibilityElement = true
        view.accessibilityLabel = route.title
        if route.kind == .captain {
            view.image = RouteMapImages.captain
            view.zPriority = .max
            RouteMapCoordinator.rotate(view, heading: route.heading)
        } else {
            view.image = RouteMapImages.dropoff
            view.transform = .identity
        }
        return view
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        guard let line = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
        let renderer = MKPolylineRenderer(polyline: line)
        renderer.lineCap = .round
        renderer.lineJoin = .round
        if line.title == RouteMapRepresentable.dashedTitle {
            renderer.strokeColor = QUIColor.ink.withAlphaComponent(0.55)
            renderer.lineWidth = 3
            renderer.lineDashPattern = [NSNumber(value: 2), NSNumber(value: 8)]
        } else if line.title == RouteMapRepresentable.casingTitle {
            renderer.strokeColor = UIColor.white
            renderer.lineWidth = 7
        } else {
            renderer.strokeColor = QUIColor.saffron
            renderer.lineWidth = 4
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
                    .foregroundColor(QTheme.primary)
                    .offset(y: -22)
                    .accessibilityHidden(true)
            }
            .safeAreaInset(edge: .bottom) {
                QNightBar {
                    Button {
                        Task { await useMyLocation() }
                    } label: {
                        Label(lang.t("map.use_my_location"), systemImage: "location.fill")
                    }
                    .buttonStyle(SecondaryButtonStyle(compact: true))
                    Button(lang.t("map.confirm_pin")) {
                        onConfirm(region.center.latLng)
                        dismiss()
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }
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

    private func useMyLocation() async {
        guard let loc = await location.currentLocation() else { return }
        withAnimation {
            region = MKCoordinateRegion(center: loc.coordinate,
                                        span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01))
        }
    }
}
