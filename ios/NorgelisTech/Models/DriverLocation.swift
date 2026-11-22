import Foundation

struct DriverLocationPayload: Codable {
    var driverId: String
    var bookingCode: String?
    var latitude: Double
    var longitude: Double
    var heading: Double?
    var speedKmh: Double?
    var timestamp: Date
}

struct DriverTrackingStatus: Codable {
    var isEnRoute: Bool
    var driverName: String?
    var latitude: Double?
    var longitude: Double?
    var heading: Double?
    var etaMinutes: Int?
    var destinationAddress: String?
    var updatedAt: Date?
}
