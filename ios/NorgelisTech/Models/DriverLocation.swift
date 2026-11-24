import Foundation

/// What `GET /api/bookings/:code/driver` answers: whether a driver is on the way to this booking, and where.
struct DriverTrackingStatus: Decodable, Equatable {
    var isEnRoute: Bool
    var driverName: String?
    var latitude: Double?
    var longitude: Double?
    var heading: Double?
    var etaMinutes: Int?
    var updatedAt: String?

    static let idle = DriverTrackingStatus(isEnRoute: false)
}

/// One driver on the owner's radar (`GET /api/admin/driver/live`).
struct LiveDriver: Decodable, Identifiable, Equatable {
    var name: String
    var latitude: Double
    var longitude: Double
    var heading: Double?
    var speedKmh: Double?
    var bookingCode: String?
    var etaMinutes: Int?
    var updatedAt: String

    var id: String { name + (bookingCode ?? "") }
}
