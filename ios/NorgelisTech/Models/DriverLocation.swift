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

/// A driver not on a trip: where the last trip ended, and when.
struct IdleDriver: Decodable, Equatable, Identifiable {
    var name: String
    var latitude: Double
    var longitude: Double
    var lastSeen: String

    var id: String { name + lastSeen }
}

/// The owner's radar: who is driving now, and where the others ended their last trip.
struct DriverRadar: Decodable, Equatable {
    var drivers: [LiveDriver]
    var idle: [IdleDriver]?
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
