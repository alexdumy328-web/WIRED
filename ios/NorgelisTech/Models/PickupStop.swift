import Foundation
import CoreLocation

struct PickupStop: Identifiable, Hashable {
    var id: String
    var bookingCode: String
    var customerName: String
    var customerPhone: String
    var address: String
    var coordinate: CLLocationCoordinate2D
    var type: PickupTrips
    var isUrgent: Bool
    var scheduledTime: String
    var isCompleted: Bool = false
    /// The booking's status on the server, when the stop came from there.
    var bookingStatus: BookingStatus?
    /// A delivery hands a repaired device back; otherwise the driver collects one.
    var isDelivery: Bool = false

    static func == (lhs: PickupStop, rhs: PickupStop) -> Bool {
        lhs.id == rhs.id && lhs.isCompleted == rhs.isCompleted
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
        hasher.combine(isCompleted)
    }
}

extension PickupStop {
    /// A stop built from one of today's pickup jobs on the server.
    init(job: PickupJob, isCompleted: Bool = false) {
        self.init(
            id: job.code,
            bookingCode: job.code,
            customerName: job.name,
            customerPhone: job.phone,
            address: job.address,
            coordinate: CLLocationCoordinate2D(latitude: job.lat, longitude: job.lon),
            type: job.trips,
            isUrgent: job.urgent,
            scheduledTime: ShopCalendar.time(job.slot),
            isCompleted: isCompleted || job.completed == true,
            bookingStatus: job.status,
            isDelivery: job.leg == "deliver" || (job.leg == nil && job.trips == .dropoff)
        )
    }
}
