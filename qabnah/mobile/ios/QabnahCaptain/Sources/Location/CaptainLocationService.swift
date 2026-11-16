import CoreLocation
import Combine
import QabnahKit

/// Continuous location while online: standard updates (foreground + background mode `location`)
/// plus significant-change monitoring so iOS can relaunch the app if it was terminated.
@MainActor
final class CaptainLocationService: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var authorization: CLAuthorizationStatus
    @Published private(set) var lastLocation: CLLocation?
    @Published private(set) var isTracking = false

    /// Called for every fix while tracking.
    var onLocation: ((CLLocation) -> Void)?

    private let manager = CLLocationManager()
    private var waiters: [CheckedContinuation<CLLocation?, Never>] = []

    override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 10
        manager.activityType = .otherNavigation
        manager.pausesLocationUpdatesAutomatically = false
    }

    var isDenied: Bool { authorization == .denied || authorization == .restricted }
    var isAuthorized: Bool { authorization == .authorizedWhenInUse || authorization == .authorizedAlways }

    func requestPermission() {
        switch authorization {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse: manager.requestAlwaysAuthorization() // upgrade prompt for background
        default: break
        }
    }

    /// One fix (used when going online and for status actions). Nil if denied or timed out.
    func currentLocation(timeout: TimeInterval = 10) async -> CLLocation? {
        if isDenied { return nil }
        if let last = lastLocation, Date().timeIntervalSince(last.timestamp) < 30 { return last }
        return await withCheckedContinuation { cont in
            waiters.append(cont)
            if authorization == .notDetermined {
                manager.requestWhenInUseAuthorization()
            } else {
                manager.requestLocation()
            }
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                self?.resolveWaiters(self?.lastLocation)
            }
        }
    }

    func startTracking() {
        guard !isTracking else { return }
        isTracking = true
        if Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes").map({ ($0 as? [String])?.contains("location") ?? false }) == true {
            manager.allowsBackgroundLocationUpdates = true
            manager.showsBackgroundLocationIndicator = true
        }
        manager.startUpdatingLocation()
        if CLLocationManager.significantLocationChangeMonitoringAvailable() {
            manager.startMonitoringSignificantLocationChanges()
        }
        if authorization == .authorizedWhenInUse { manager.requestAlwaysAuthorization() }
    }

    func stopTracking() {
        guard isTracking else { return }
        isTracking = false
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        manager.allowsBackgroundLocationUpdates = false
    }

    private func resolveWaiters(_ location: CLLocation?) {
        let pending = waiters
        waiters.removeAll()
        pending.forEach { $0.resume(returning: location) }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.authorization = status
            if self.isAuthorized, !self.waiters.isEmpty { self.manager.requestLocation() }
            if self.isDenied { self.resolveWaiters(nil) }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in
            self.lastLocation = loc
            self.resolveWaiters(loc)
            if self.isTracking { self.onLocation?(loc) }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.resolveWaiters(self.lastLocation) }
    }
}

extension CLLocation {
    var ping: LocationPing {
        LocationPing(lat: coordinate.latitude, lng: coordinate.longitude,
                     heading: course, speed: speed, accuracy: horizontalAccuracy)
    }
}
