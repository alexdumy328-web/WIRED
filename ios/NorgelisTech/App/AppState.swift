import SwiftUI
import CoreLocation
import Combine

final class AppState: ObservableObject {
    @Published var selectedRole: UserRole = .driver
    @Published var isDevRolePickerVisible: Bool = true
    @Published var isSettingsPresented: Bool = false

    // Driver tracking state
    @Published var stops: [PickupStop] = MockData.driverStops
    @Published var currentEnRouteStop: PickupStop?
    @Published var isDriverEnRoute: Bool = false
    @Published var driverCoordinate: CLLocationCoordinate2D = MockData.shopCoordinate
    @Published var etaMinutes: Int = 12

    // Bookings state for Owner and Customer
    @Published var bookings: [Booking] = MockData.bookings
    @Published var currentCustomerBooking: Booking?
    @Published var customerSearchQuery: String = "NT-4K7Q"

    // Services
    let locationService = LocationService.shared
    let apiClient = APIClient.shared
    private var cancellables = Set<AnyCancellable>()

    init() {
        // Default to first booking for customer view convenience
        self.currentCustomerBooking = MockData.bookings.first

        // Observe location updates
        locationService.$currentLocation
            .compactMap { $0?.coordinate }
            .sink { [weak self] coord in
                guard let self = self else { return }
                self.driverCoordinate = coord
                if let stop = self.currentEnRouteStop {
                    self.updateEta(to: stop.coordinate, from: coord)
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Driver Actions

    func startTripToStop(_ stop: PickupStop) {
        currentEnRouteStop = stop
        isDriverEnRoute = true
        etaMinutes = 12

        // Start real location service with background mode enabled
        locationService.startTracking(allowBackground: true)

        // Also run simulated progress so on simulator/dev without GPS movement,
        // the driver visibly drives to the client!
        locationService.startSimulation(from: MockData.shopCoordinate, to: stop.coordinate, durationSeconds: 25.0)

        // In Phase 2: Send POST /api/driver/location
        let payload = DriverLocationPayload(
            driverId: "driver-alex",
            bookingCode: stop.bookingCode,
            latitude: MockData.shopCoordinate.latitude,
            longitude: MockData.shopCoordinate.longitude,
            heading: 90.0,
            speedKmh: 40.0,
            timestamp: Date()
        )
        Task {
            try? await apiClient.sendDriverLocation(payload)
        }
    }

    func completeCurrentStop() {
        guard let current = currentEnRouteStop else { return }
        if let idx = stops.firstIndex(where: { $0.id == current.id }) {
            stops[idx].isCompleted = true
        }

        // If this corresponds to an active booking, update status to done/received
        if let bookingIdx = bookings.firstIndex(where: { $0.code == current.bookingCode }) {
            bookings[bookingIdx].status = current.type == .pickup ? .received : .done
        }

        isDriverEnRoute = false
        currentEnRouteStop = nil
        locationService.stopTracking()
        driverCoordinate = MockData.shopCoordinate
    }

    // MARK: - Customer Actions

    func searchBooking(code: String) {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        customerSearchQuery = trimmed

        if let found = bookings.first(where: { $0.code.uppercased() == trimmed }) {
            currentCustomerBooking = found
        } else {
            // Attempt API call if reachable
            Task { @MainActor in
                do {
                    let remoteBooking = try await apiClient.fetchBooking(code: trimmed)
                    self.currentCustomerBooking = remoteBooking
                } catch {
                    print("[Customer] Search failed for \(trimmed): \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - Helpers

    private func updateEta(to destination: CLLocationCoordinate2D, from current: CLLocationCoordinate2D) {
        // Approximate distance calculation
        let latDelta = (destination.latitude - current.latitude) * 111.0
        let lonDelta = (destination.longitude - current.longitude) * 111.0 * cos(current.latitude * .pi / 180.0)
        let distanceKm = sqrt(latDelta * latDelta + lonDelta * lonDelta)
        // Assume 25 km/h urban speed in Iași traffic + 2 min buffer
        let estimated = max(1, Int(ceil((distanceKm / 25.0) * 60.0)))
        DispatchQueue.main.async {
            self.etaMinutes = estimated
        }
    }
}
