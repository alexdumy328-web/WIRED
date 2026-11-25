import SwiftUI
import MapKit

extension MKMultiPoint {
    /// The points of a polyline as plain coordinates.
    var coordinates: [CLLocationCoordinate2D] {
        var out = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: pointCount)
        getCoordinates(&out, range: NSRange(location: 0, length: pointCount))
        return out
    }
}

/// Plans the driving legs through today's remaining stops and follows the driver along the first one.
@MainActor
final class DriverRoutePlanner: ObservableObject {
    struct Leg: Identifiable {
        /// The stop this leg leads to.
        let id: String
        let route: MKRoute
        let coordinates: [CLLocationCoordinate2D]
        /// Meters along the line at each coordinate.
        let cumulative: [Double]
        /// Meters along the line where each step ends.
        let stepEnds: [Double]

        var distance: Double { cumulative.last ?? route.distance }
        var time: TimeInterval { route.expectedTravelTime }
    }

    struct Maneuver: Equatable {
        var text: String
        var meters: Double
        var isArrival: Bool
    }

    @Published private(set) var legs: [Leg] = []
    @Published private(set) var isPlanning = false
    /// Meters still to drive on the first leg.
    @Published private(set) var metersLeft: Double = 0
    @Published private(set) var maneuver: Maneuver?

    private var task: Task<Void, Never>?
    /// Minutes the driver stays at each stop, for later arrival times.
    private let dwell: TimeInterval = 8 * 60

    // MARK: - Planning

    func plan(origin: CLLocationCoordinate2D, stops: [PickupStop], maxLegs: Int = 5) {
        task?.cancel()
        guard !stops.isEmpty else {
            legs = []
            maneuver = nil
            metersLeft = 0
            return
        }
        isPlanning = true
        task = Task {
            var from = origin
            var out: [Leg] = []
            for stop in stops.prefix(maxLegs) {
                if Task.isCancelled { return }
                guard let leg = await Self.leg(from: from, to: stop) else { break }
                out.append(leg)
                from = stop.coordinate
            }
            if Task.isCancelled { return }
            legs = out
            isPlanning = false
            update(driver: origin)
        }
    }

    private static func leg(from: CLLocationCoordinate2D, to stop: PickupStop) async -> Leg? {
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: from))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: stop.coordinate))
        request.transportType = .automobile
        guard let route = try? await MKDirections(request: request).calculate().routes.first else { return nil }
        let coords = route.polyline.coordinates
        var cumulative: [Double] = [0]
        for i in 1..<max(coords.count, 1) {
            let a = CLLocation(latitude: coords[i - 1].latitude, longitude: coords[i - 1].longitude)
            let b = CLLocation(latitude: coords[i].latitude, longitude: coords[i].longitude)
            cumulative.append(cumulative[i - 1] + a.distance(from: b))
        }
        var ends: [Double] = []
        var sum = 0.0
        for step in route.steps {
            sum += step.distance
            ends.append(sum)
        }
        return Leg(id: stop.id, route: route, coordinates: coords, cumulative: cumulative, stepEnds: ends)
    }

    // MARK: - Following the driver

    /// Works out how far along the first leg the driver is and what comes next.
    func update(driver: CLLocationCoordinate2D) {
        guard let leg = legs.first, !leg.coordinates.isEmpty else {
            metersLeft = 0
            maneuver = nil
            return
        }
        let here = CLLocation(latitude: driver.latitude, longitude: driver.longitude)
        var best = 0
        var bestDistance = Double.greatestFiniteMagnitude
        for (i, c) in leg.coordinates.enumerated() {
            let d = here.distance(from: CLLocation(latitude: c.latitude, longitude: c.longitude))
            if d < bestDistance { bestDistance = d; best = i }
        }
        let along = leg.cumulative[best]
        // Shown rounded anyway: publishing a change of a few metres would redraw the trip panel on every fix.
        let left = max(0, leg.distance - along)
        if abs(left - metersLeft) >= 10 || left == 0 { metersLeft = left }

        let steps = leg.route.steps
        var next: Maneuver?
        for (i, end) in leg.stepEnds.enumerated() where end > along + 1 {
            if i + 1 < steps.count, !steps[i + 1].instructions.isEmpty {
                next = Maneuver(text: steps[i + 1].instructions, meters: end - along, isArrival: i + 1 == steps.count - 1)
            } else {
                next = Maneuver(text: "", meters: metersLeft, isArrival: true)
            }
            break
        }
        let upcoming = next ?? Maneuver(text: "", meters: metersLeft, isArrival: true)
        if upcoming.text != maneuver?.text || upcoming.isArrival != maneuver?.isArrival || abs(upcoming.meters - (maneuver?.meters ?? 0)) >= 10 {
            maneuver = upcoming
        }
    }

    // MARK: - Numbers

    /// Seconds left on the first leg.
    var secondsLeftOnFirstLeg: TimeInterval {
        guard let leg = legs.first, leg.distance > 0 else { return 0 }
        return leg.time * min(1, metersLeft / leg.distance)
    }

    /// True when the first planned leg leads to this stop, so the numbers on screen are about it.
    func hasRoute(to stopID: String) -> Bool {
        !isPlanning && legs.first?.id == stopID
    }

    /// Minutes to the next stop, rounded up.
    var etaMinutes: Int { max(1, Int(ceil(secondsLeftOnFirstLeg / 60))) }

    /// When the driver should reach a planned stop, counting the time left on the first leg and a stop at each one before it.
    func arrival(of stopID: String, from now: Date = Date()) -> Date? {
        // While the legs are being planned again the old times belong to the old order.
        guard !isPlanning else { return nil }
        var seconds = 0.0
        for (i, leg) in legs.enumerated() {
            seconds += i == 0 ? secondsLeftOnFirstLeg : leg.time
            if leg.id == stopID { return now.addingTimeInterval(seconds) }
            seconds += dwell
        }
        return nil
    }

    /// Distance and drive time for the leg that ends at a stop.
    func leg(to stopID: String) -> (meters: Double, seconds: TimeInterval)? {
        guard !isPlanning else { return nil }
        guard let i = legs.firstIndex(where: { $0.id == stopID }) else { return nil }
        let leg = legs[i]
        return i == 0 ? (metersLeft, secondsLeftOnFirstLeg) : (leg.distance, leg.time)
    }

    var totalMeters: Double {
        legs.enumerated().reduce(0) { $0 + ($1.offset == 0 ? metersLeft : $1.element.distance) }
    }

    var totalSeconds: TimeInterval {
        legs.enumerated().reduce(0) { $0 + ($1.offset == 0 ? secondsLeftOnFirstLeg : $1.element.time) } + dwell * Double(max(0, legs.count - 1))
    }

    var firstLegCoordinates: [CLLocationCoordinate2D] { legs.first?.coordinates ?? [] }
    var firstLegSeconds: TimeInterval { legs.first?.time ?? 0 }
}

enum DriveFormat {
    private static let distance: MKDistanceFormatter = {
        let f = MKDistanceFormatter()
        f.unitStyle = .abbreviated
        return f
    }()

    static func distance(_ meters: Double) -> String { distance.string(fromDistance: meters) }

    /// "7 min" or "1 h 12 min"
    static func duration(_ seconds: TimeInterval) -> String {
        let minutes = max(1, Int(ceil(seconds / 60)))
        return minutes < 60 ? "\(minutes) min" : "\(minutes / 60) h \(minutes % 60) min"
    }

    static func clock(_ date: Date) -> String { ShopCalendar.clock(date) }
}
