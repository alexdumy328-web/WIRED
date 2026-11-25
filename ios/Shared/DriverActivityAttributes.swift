import ActivityKit
import Foundation

/// The "driver on the way" Live Activity, shared by the app and the widget extension.
/// The server starts and updates it by push (site/server/push.ts), so the names and the JSON shape must match
/// `LiveState` there and the `attributes-type` it sends.
struct DriverActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        enum Phase: String, Codable, Hashable {
            case onTheWay, arriving, arrived, ended
        }

        var driverName: String
        var etaMinutes: Int?
        var phase: Phase
        /// Seconds since 1970 (not a Date: the server writes plain numbers).
        var updatedAt: Double

        var isOver: Bool { phase == .arrived || phase == .ended }

        /// When the van should be at the door: the ETA counted from the moment it was measured.
        var arrival: Date? {
            guard let etaMinutes, !isOver else { return nil }
            return Date(timeIntervalSince1970: updatedAt + Double(etaMinutes) * 60)
        }
    }

    /// The booking code, for example NT-4K7Q.
    var code: String
    /// "Apple iPhone 13", or empty.
    var device: String
    /// When the driver set off (seconds since 1970), for the progress track. Older payloads may leave it out.
    var startedAt: Double?
}

extension DriverActivityAttributes {
    /// Opens the booking in the app when the Live Activity is tapped.
    static func link(for code: String) -> URL? { URL(string: "norgelis://booking/\(code)") }
}
