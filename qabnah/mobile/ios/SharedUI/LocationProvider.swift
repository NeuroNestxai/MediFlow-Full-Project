import CoreLocation
import Combine
import QabnahKit

/// One-shot "where am I" helper (when-in-use permission).
@MainActor
final class LocationProvider: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var authorization: CLAuthorizationStatus
    @Published private(set) var lastLocation: CLLocation?

    private let manager = CLLocationManager()
    private var waiters: [CheckedContinuation<CLLocation?, Never>] = []

    override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    var isDenied: Bool { authorization == .denied || authorization == .restricted }
    var isAuthorized: Bool { authorization == .authorizedWhenInUse || authorization == .authorizedAlways }

    func requestPermission() {
        if authorization == .notDetermined { manager.requestWhenInUseAuthorization() }
    }

    /// Current location, asking for permission if needed. Nil if denied, failed or timed out.
    func currentLocation(timeout: TimeInterval = 10) async -> CLLocation? {
        if isDenied { return nil }
        if let last = lastLocation, Date().timeIntervalSince(last.timestamp) < 60 { return last }
        return await withCheckedContinuation { cont in
            waiters.append(cont)
            if authorization == .notDetermined {
                manager.requestWhenInUseAuthorization()
            } else {
                manager.requestLocation()
            }
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                self?.finish(with: self?.lastLocation)
            }
        }
    }

    private func finish(with location: CLLocation?) {
        let pending = waiters
        waiters.removeAll()
        pending.forEach { $0.resume(returning: location) }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.authorization = status
            if self.isAuthorized, !self.waiters.isEmpty {
                self.manager.requestLocation()
            } else if self.isDenied {
                self.finish(with: nil)
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in
            self.lastLocation = loc
            self.finish(with: loc)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.finish(with: self.lastLocation) }
    }
}

extension CLLocationCoordinate2D {
    init(_ ll: LatLng) { self.init(latitude: ll.lat, longitude: ll.lng) }
    var latLng: LatLng { LatLng(lat: latitude, lng: longitude) }
}

extension CLLocation {
    var latLng: LatLng { coordinate.latLng }
}
