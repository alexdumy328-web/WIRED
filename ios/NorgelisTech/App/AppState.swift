import SwiftUI
import CoreLocation
import Combine

@MainActor
final class AppState: ObservableObject {
    // Driver tracking state
    /// Today's stops. Completed ones first, then the remaining ones in the order the driver will go.
    @Published var stops: [PickupStop] = APIClient.shared.useMockData ? MockData.driverStops : []
    /// True while today's stops load from the server.
    @Published var stopsLoading = false
    /// Set when the stops could not load.
    @Published var stopsError: String?
    @Published var currentEnRouteStop: PickupStop?
    @Published var isDriverEnRoute: Bool = false
    @Published var driverCoordinate: CLLocationCoordinate2D = Shop.coordinate
    @Published var etaMinutes: Int = 12
    /// The stop whose details are open in the driver panel.
    @Published var focusedStopID: String?

    // Bookings state for Owner and Customer
    @Published var bookings: [Booking] = APIClient.shared.useMockData ? MockData.bookings : []
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
    /// Shares the driver's position with the server during a live trip.
    private lazy var sharing = DriverSharing(api: apiClient)
    /// Where the current plan starts, so a real position fix far from it replans.
    private var lastPlanOrigin = Shop.coordinate

    init() {
        // Sample data shows a demo booking. Live data starts empty, so nobody sees someone else's job.
        self.currentCustomerBooking = APIClient.shared.useMockData ? MockData.bookings.first : nil

        // Follow the driver: position, progress on the route and ETA.
        locationService.$currentLocation
            .compactMap { $0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] fix in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    let coord = fix.coordinate
                    let here = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
                    // A position far from Iasi is a simulator's default city or garbage. Never follow it.
                    let shop = CLLocation(latitude: Shop.coordinate.latitude, longitude: Shop.coordinate.longitude)
                    guard here.distance(from: shop) < 150_000 else { return }
                    if self.isDriverEnRoute {
                        self.driverCoordinate = coord
                        self.planner.update(driver: coord)
                        if self.planner.hasRoute(to: self.currentEnRouteStop?.id ?? "") { self.etaMinutes = self.planner.etaMinutes }
                        // Live trips tell the server where the van is. Demo accounts and sample data stay on the phone.
                        if !self.apiClient.useMockData {
                            self.sharing.offer(fix, bookingCode: self.currentEnRouteStop?.bookingCode, etaMinutes: self.etaMinutes)
                        }
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
                    self.bookings = sample ? MockData.bookings : []
                    self.stops = sample ? MockData.driverStops : []
                    self.replan()
                    // The staff home reloads the live stops when the data source changes.
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

    /// Today's pickups and drop-offs. Sample data uses the built-in list. A live sign-in asks the server.
    func loadStops() async {
        if apiClient.useMockData {
            stopsError = nil
            return
        }
        stopsLoading = true
        stopsError = nil
        defer { stopsLoading = false }
        do {
            let reply: PickupsResponse = try await apiClient.request("GET", "api/driver/pickups", query: [
                URLQueryItem(name: "date", value: ShopCalendar.dateString()),
            ])
            guard !apiClient.useMockData else { return }
            let done = Set(stops.filter(\.isCompleted).map(\.id)).union(Self.savedDone())
            let fresh = reply.jobs.map { job in
                PickupStop(job: job, isCompleted: done.contains(job.code))
            }
            // A trip under way keeps its stop even if the list changed under it.
            stops = fresh.filter(\.isCompleted) + fresh.filter { !$0.isCompleted }
            replan()
        } catch is CancellationError {
            return
        } catch {
            stopsError = error.localizedDescription
        }
    }

    // MARK: - Completed stops survive a restart (codes only, per day)

    private static var doneKey: String { "norgelis_done_\(ShopCalendar.dateString())" }

    private static func savedDone() -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: doneKey) ?? [])
    }

    private static func saveDone(_ id: String) {
        UserDefaults.standard.set(Array(savedDone().union([id])), forKey: doneKey)
    }

    /// Signed out or switched account: stop the trip and GPS and forget everything the last person saw.
    /// `clearSavedDone` is false on the first launch (the saved done stops belong to the same driver) and true on sign-out.
    func resetSession(clearSavedDone: Bool = true) {
        tripTask?.cancel()
        lookupTask?.cancel()
        sharing.stop()
        locationService.stopTracking()
        isDriverEnRoute = false
        currentEnRouteStop = nil
        focusedStopID = nil
        stops = apiClient.useMockData ? MockData.driverStops : []
        stopsError = nil
        stopsLoading = false
        bookings = apiClient.useMockData ? MockData.bookings : []
        currentCustomerBooking = apiClient.useMockData ? MockData.bookings.first : nil
        customerSearchQuery = ""
        customerLookupError = nil
        customerLookupBusy = false
        if clearSavedDone { UserDefaults.standard.removeObject(forKey: Self.doneKey) }
        driverCoordinate = Shop.coordinate
        replan()
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
        // A live trip keeps sharing when the driver switches to Waze (the location background mode). A demo never does.
        locationService.startTracking(allowBackground: !apiClient.useMockData)

        tripTask?.cancel()
        tripTask = Task { [weak self] in
            guard let self else { return }
            var waited = 0.0
            while (self.planner.isPlanning || self.planner.legs.first?.id != target.id), waited < 8, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 100_000_000)
                waited += 0.1
            }
            guard !Task.isCancelled, self.isDriverEnRoute, self.currentEnRouteStop?.id == target.id else { return }
            // A simulator has no GPS movement, and a demo account has no real trip, so drive the car along the planned route.
            // A real phone on a live account uses its own position.
            if self.apiClient.useMockData || Self.runsOnSimulator {
                let path = self.planner.firstLegCoordinates
                if path.count > 1 {
                    let seconds = min(45, max(20, self.planner.firstLegSeconds / 10))
                    self.locationService.startSimulation(along: path, durationSeconds: seconds)
                } else {
                    self.locationService.startSimulation(from: self.driverCoordinate, to: target.coordinate, durationSeconds: 25)
                }
            }
            if self.planner.hasRoute(to: target.id) { self.etaMinutes = self.planner.etaMinutes }
        }
    }

    /// The driver changes their mind before arriving. The stop stays on the list.
    func cancelTrip() {
        tripTask?.cancel()
        sharing.stop()
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
            if !apiClient.useMockData { Self.saveDone(current.id) }
            // Completed stops stay at the top, in the order they were done.
            let done = stops.remove(at: idx)
            stops.insert(done, at: completedStops.count)
        }

        if apiClient.useMockData {
            if let bookingIdx = bookings.firstIndex(where: { $0.code == current.bookingCode }) {
                bookings[bookingIdx].status = current.type == .dropoff ? .done : .received
            }
        } else {
            syncCompleted(current)
        }

        sharing.stop()
        isDriverEnRoute = false
        currentEnRouteStop = nil
        locationService.stopTracking()
        driverCoordinate = current.coordinate
        replan()
    }

    /// Tells the server the stop is done: a delivery closes the booking, a pickup leaves a note in its history.
    /// Nobody is emailed from here. The owner decides when the customer hears.
    private func syncCompleted(_ stop: PickupStop) {
        let delivered = stop.type == .dropoff
        let note = String(localized: delivered ? "driver.note.delivered" : "driver.note.collected")
        Task {
            do {
                try await apiClient.requestVoid("PATCH", "api/driver/bookings/\(stop.bookingCode)/status",
                                                body: ["delivered": delivered, "note": note])
            } catch is CancellationError {
                return
            } catch {
                stopsError = String(localized: "driver.sync_failed")
            }
        }
    }

    private static var runsOnSimulator: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
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

    /// Puts the driver demo back to the start (sample data only).
    func resetDriverDemo() {
        tripTask?.cancel()
        stops = apiClient.useMockData ? MockData.driverStops : []
        bookings = apiClient.useMockData ? MockData.bookings : []
        currentCustomerBooking = apiClient.useMockData ? MockData.bookings.first : nil
        isDriverEnRoute = false
        currentEnRouteStop = nil
        focusedStopID = nil
        driverCoordinate = Shop.coordinate
        locationService.stopTracking()
        replan()
    }
}
