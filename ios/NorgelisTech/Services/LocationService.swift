import Foundation
import CoreLocation
import Combine

final class LocationService: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = LocationService()

    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined
    @Published var currentLocation: CLLocation?
    @Published var isUpdatingLocation: Bool = false
    @Published var isBackgroundLocationEnabled: Bool = false
    @Published var simulatedRouteProgress: Double = 0.0

    private let locationManager = CLLocationManager()
    private var simulationTimer: AnyCancellable?

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.distanceFilter = 5.0 // Update every 5 meters
        authorizationStatus = locationManager.authorizationStatus
    }

    // MARK: - Permission Requests

    func requestWhenInUsePermission() {
        locationManager.requestWhenInUseAuthorization()
    }

    func requestAlwaysPermission() {
        locationManager.requestAlwaysAuthorization()
    }

    // MARK: - Tracking Management

    func startTracking(allowBackground: Bool = true) {
        #if os(iOS)
        if allowBackground {
            // Background location updates capability
            // Note: requires "location" in UIBackgroundModes in Info.plist
            locationManager.allowsBackgroundLocationUpdates = true
            locationManager.showsBackgroundLocationIndicator = true
            locationManager.pausesLocationUpdatesAutomatically = false
            isBackgroundLocationEnabled = true
        }
        #endif

        locationManager.startUpdatingLocation()
        locationManager.startUpdatingHeading()
        isUpdatingLocation = true
    }

    func stopTracking() {
        locationManager.stopUpdatingLocation()
        locationManager.stopUpdatingHeading()
        #if os(iOS)
        locationManager.allowsBackgroundLocationUpdates = false
        #endif
        isUpdatingLocation = false
        isBackgroundLocationEnabled = false
        stopSimulation()
    }

    // MARK: - Simulation for Development & Simulator

    func startSimulation(from start: CLLocationCoordinate2D, to destination: CLLocationCoordinate2D, durationSeconds: Double = 30.0) {
        stopSimulation()
        simulatedRouteProgress = 0.0

        let totalSteps = 60
        let interval = durationSeconds / Double(totalSteps)
        var step = 0

        simulationTimer = Timer.publish(every: interval, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self = self else { return }
                step += 1
                let progress = min(1.0, Double(step) / Double(totalSteps))
                self.simulatedRouteProgress = progress

                // Interpolate latitude and longitude
                let lat = start.latitude + (destination.latitude - start.latitude) * progress
                let lon = start.longitude + (destination.longitude - start.longitude) * progress

                let simulatedLocation = CLLocation(
                    coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                    altitude: 50.0,
                    horizontalAccuracy: 5.0,
                    verticalAccuracy: 5.0,
                    course: 90.0,
                    speed: 11.1, // ~40 km/h
                    timestamp: Date()
                )

                self.currentLocation = simulatedLocation

                if progress >= 1.0 {
                    self.stopSimulation()
                }
            }
    }

    /// Drives the simulated location along a real route instead of a straight line.
    func startSimulation(along path: [CLLocationCoordinate2D], durationSeconds: Double) {
        guard path.count > 1 else { return }
        stopSimulation()
        simulatedRouteProgress = 0

        var cumulative: [Double] = [0]
        for i in 1..<path.count {
            let a = CLLocation(latitude: path[i - 1].latitude, longitude: path[i - 1].longitude)
            let b = CLLocation(latitude: path[i].latitude, longitude: path[i].longitude)
            cumulative.append(cumulative[i - 1] + a.distance(from: b))
        }
        let total = max(cumulative.last ?? 1, 1)
        let totalSteps = 90
        let interval = durationSeconds / Double(totalSteps)
        var step = 0

        simulationTimer = Timer.publish(every: interval, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self = self else { return }
                step += 1
                let progress = min(1.0, Double(step) / Double(totalSteps))
                self.simulatedRouteProgress = progress
                let target = progress * total
                var i = 1
                while i < cumulative.count - 1, cumulative[i] < target { i += 1 }
                let span = max(cumulative[i] - cumulative[i - 1], 0.001)
                let t = min(1, max(0, (target - cumulative[i - 1]) / span))
                let a = path[i - 1], b = path[i]
                let coordinate = CLLocationCoordinate2D(
                    latitude: a.latitude + (b.latitude - a.latitude) * t,
                    longitude: a.longitude + (b.longitude - a.longitude) * t
                )
                let course = atan2(b.longitude - a.longitude, b.latitude - a.latitude) * 180 / .pi
                self.currentLocation = CLLocation(
                    coordinate: coordinate, altitude: 50, horizontalAccuracy: 5, verticalAccuracy: 5,
                    course: course < 0 ? course + 360 : course, speed: 11.1, timestamp: Date()
                )
                if progress >= 1 { self.stopSimulation() }
            }
    }

    func stopSimulation() {
        simulationTimer?.cancel()
        simulationTimer = nil
    }

    // MARK: - CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        DispatchQueue.main.async {
            self.authorizationStatus = manager.authorizationStatus
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let latest = locations.last else { return }
        DispatchQueue.main.async {
            self.currentLocation = latest
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[LocationService] Error: \(error.localizedDescription)")
    }
}
