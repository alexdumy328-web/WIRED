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

    static func == (lhs: PickupStop, rhs: PickupStop) -> Bool {
        lhs.id == rhs.id && lhs.isCompleted == rhs.isCompleted
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
        hasher.combine(isCompleted)
    }
}
