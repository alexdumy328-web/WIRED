import SwiftUI
import CoreLocation
import Combine

@MainActor
final class AppState: ObservableObject {
    @Published var selectedRole: UserRole = .driver
    @Published var isDevRolePickerVisible: Bool = true
    @Published var isSettingsPresented: Bool = false
    @Published var isAccountPresented: Bool = false

    // Driver tracking state
    /// Today's stops. Completed ones first, then the remaining ones in the order the driver will go.
    @Published var stops: [PickupStop] = MockData.driverStops
    @Published var currentEnRouteStop: PickupStop?
    @Published var isDriverEnRoute: Bool = false
    @Published var driverCoordinate: CLLocationCoordinate2D = MockData.shopCoordinate
    @Published var etaMinutes: Int = 12
    /// The stop whose details are open in the driver panel.
    @Published var focusedStopID: String?

    // Bookings state for Owner and Customer
    @Published var bookings: [Booking] = MockData.bookings
    @Published var currentCustomerBooking: Booking?
    @Published var customerSearchQuery: String = APIClient.shared.useMockData ? "NT-4K7Q" : ""
    /// What the last lookup said, in words, when it found nothing.
    @Published var customerLookupError: String?
    @Published var customerLookupBusy = false

    // Services
    let locationService = LocationService.shared
    let apiClient = APIClient.shared
    let planner = DriverRoutePlanner()
    private var cancellables = Set<AnyCancellable>()
    private var tripTask: Task<Void, Never>?
    private var lookupTask: Task<Void, Never>?
    /// Where the current plan starts, so a real position fix far from it replans.
    private var lastPlanOrigin = MockData.shopCoordinate

    init() {
        // Default to first booking for customer view convenience
        // Sample data shows a demo booking. Live data starts empty, so nobody sees someone else's job.
        self.currentCustomerBooking = APIClient.shared.useMockData ? MockData.bookings.first : nil

        // Follow the driver: position, progress on the route and ETA.
        locationService.$currentLocation
            .compactMap { $0?.coordinate }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] coord in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    let here = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
                    // A position far from Iasi is a simulator's default city or garbage. Never follow it.
                    let shop = CLLocation(latitude: MockData.shopCoordinate.latitude, longitude: MockData.shopCoordinate.longitude)
                    guard here.distance(from: shop) < 150_000 else { return }
                    if self.isDriverEnRoute {
                        self.driverCoordinate = coord
                        self.planner.update(driver: coord)
                        if self.planner.hasRoute(to: self.currentEnRouteStop?.id ?? "") { self.etaMinutes = self.planner.etaMinutes }
                    } else {
                        // Idle fix: replan only when the driver really moved.
                        let origin = CLLocation(latitude: self.lastPlanOrigin.latitude, longitude: self.lastPlanOrigin.longitude)
                        guard here.distance(from: origin) > 300 else { return }
                        self.driverCoordinate = coord
                        self.replan()
                    }
                }
            }
            .store(in: &cancellables)

        // Switching between sample and live data must not leave the other source's booking on screen.
        apiClient.$useMockData
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] sample in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    self.lookupTask?.cancel()
                    self.customerLookupBusy = false
                    self.customerLookupError = nil
                    self.currentCustomerBooking = sample ? MockData.bookings.first : nil
                }
            }
            .store(in: &cancellables)

        replan()
    }

    // MARK: - Stops

    var remainingStops: [PickupStop] { stops.filter { !$0.isCompleted } }
    var completedStops: [PickupStop] { stops.filter { $0.isCompleted } }
    var nextStop: PickupStop? { remainingStops.first }
    var focusedStop: PickupStop? { stops.first { $0.id == focusedStopID } }

    /// 1-based place of a stop among the ones still to do.
    func number(of stop: PickupStop) -> Int? {
        remainingStops.firstIndex { $0.id == stop.id }.map { $0 + 1 }
    }

    /// Plans the legs again from where the driver is, through the remaining stops in order.
    func replan() {
        lastPlanOrigin = driverCoordinate
        planner.plan(origin: driverCoordinate, stops: remainingStops)
    }

    func moveRemaining(from offsets: IndexSet, to destination: Int) {
        var remaining = remainingStops
        remaining.move(fromOffsets: offsets, toOffset: destination)
        stops = completedStops + remaining
        replan()
    }

    func makeNext(_ stop: PickupStop) {
        guard let current = stops.first(where: { $0.id == stop.id }), !current.isCompleted else { return }
        var remaining = remainingStops
        remaining.removeAll { $0.id == stop.id }
        remaining.insert(current, at: 0)
        stops = completedStops + remaining
        replan()
    }

    // MARK: - Driver Actions

    func startTripToStop(_ stop: PickupStop) {
        makeNext(stop)
        guard let target = stops.first(where: { $0.id == stop.id }) else { return }
        currentEnRouteStop = target
        isDriverEnRoute = true
        focusedStopID = nil

        // Real location service with background mode enabled.
        locationService.startTracking(allowBackground: true)

        tripTask?.cancel()
        tripTask = Task { [weak self] in
            guard let self else { return }
            var waited = 0.0
            while (self.planner.isPlanning || self.planner.legs.first?.id != target.id), waited < 8, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 100_000_000)
                waited += 0.1
            }
            guard !Task.isCancelled, self.isDriverEnRoute, self.currentEnRouteStop?.id == target.id else { return }
            #if targetEnvironment(simulator)
            // A simulator has no GPS movement, so drive the car along the planned route. A real phone uses its own position.
            let path = self.planner.firstLegCoordinates
            if path.count > 1 {
                let seconds = min(45, max(20, self.planner.firstLegSeconds / 10))
                self.locationService.startSimulation(along: path, durationSeconds: seconds)
            } else {
                self.locationService.startSimulation(from: self.driverCoordinate, to: target.coordinate, durationSeconds: 25)
            }
            #endif
            if self.planner.hasRoute(to: target.id) { self.etaMinutes = self.planner.etaMinutes }
            // Sharing the position with the server waits for POST /api/driver/location to exist (see README).
        }
    }

    /// The driver changes their mind before arriving. The stop stays on the list.
    func cancelTrip() {
        tripTask?.cancel()
        isDriverEnRoute = false
        currentEnRouteStop = nil
        locationService.stopTracking()
        replan()
    }

    func completeCurrentStop() {
        guard let current = currentEnRouteStop else { return }
        tripTask?.cancel()
        if let idx = stops.firstIndex(where: { $0.id == current.id }) {
            stops[idx].isCompleted = true
            // Completed stops stay at the top, in the order they were done.
            let done = stops.remove(at: idx)
            stops.insert(done, at: completedStops.count)
        }

        // If this corresponds to an active booking, update status to done/received
        if let bookingIdx = bookings.firstIndex(where: { $0.code == current.bookingCode }) {
            bookings[bookingIdx].status = current.type == .pickup ? .received : .done
        }

        isDriverEnRoute = false
        currentEnRouteStop = nil
        locationService.stopTracking()
        driverCoordinate = current.coordinate
        replan()
    }

    // MARK: - Customer Actions

    func searchBooking(code: String) {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        customerSearchQuery = trimmed
        customerLookupError = nil
        lookupTask?.cancel()

        // Sample mode answers from the sample list only and never touches the network.
        if apiClient.useMockData {
            if let found = bookings.first(where: { $0.code.uppercased() == trimmed }) {
                currentCustomerBooking = found
            } else {
                currentCustomerBooking = nil
                customerLookupError = String(localized: "customer.lookup.not_found")
            }
            return
        }

        // A new lookup never keeps the old result on screen.
        currentCustomerBooking = nil
        customerLookupBusy = true
        lookupTask = Task { @MainActor in
            do {
                let found = try await apiClient.fetchBooking(code: trimmed)
                guard !Task.isCancelled, self.customerSearchQuery == trimmed else { return }
                self.currentCustomerBooking = found
            } catch is CancellationError {
                return
            } catch APIError.notFound {
                guard !Task.isCancelled, self.customerSearchQuery == trimmed else { return }
                self.customerLookupError = String(localized: "customer.lookup.not_found")
            } catch {
                guard !Task.isCancelled, self.customerSearchQuery == trimmed else { return }
                self.customerLookupError = error.localizedDescription
            }
            if self.customerSearchQuery == trimmed { self.customerLookupBusy = false }
        }
    }

    /// Puts the driver demo back to the start.
    func resetDriverDemo() {
        tripTask?.cancel()
        stops = MockData.driverStops
        bookings = MockData.bookings
        currentCustomerBooking = apiClient.useMockData ? MockData.bookings.first : nil
        isDriverEnRoute = false
        currentEnRouteStop = nil
        focusedStopID = nil
        driverCoordinate = MockData.shopCoordinate
        locationService.stopTracking()
        replan()
    }
}
