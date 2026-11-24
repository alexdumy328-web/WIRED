import CoreLocation
import Foundation

/// Sends the driver's position to the server during a trip, and only then. It keeps traffic and battery low:
/// at most one request at a time, at least 5 seconds apart, and only when the driver moved 15 m or 20 seconds passed.
@MainActor
final class DriverSharing {
    private let api: APIClient
    private var lastSent = Date.distantPast
    private var lastLocation: CLLocation?
    private var inFlight = false
    private(set) var isSharing = false

    init(api: APIClient) { self.api = api }

    /// A new position fix. Sends it when it is worth sending.
    func offer(_ location: CLLocation, bookingCode: String?, etaMinutes: Int?) {
        let now = Date()
        guard !inFlight, now.timeIntervalSince(lastSent) >= 5 else { return }
        let moved = lastLocation.map { location.distance(from: $0) >= 15 } ?? true
        guard moved || now.timeIntervalSince(lastSent) >= 20 else { return }

        var body: [String: Any] = ["latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude]
        if location.course >= 0 { body["heading"] = location.course }
        if location.speed >= 0 { body["speedKmh"] = (location.speed * 3.6).rounded() }
        if let bookingCode { body["bookingCode"] = bookingCode }
        if let etaMinutes { body["etaMinutes"] = etaMinutes }

        inFlight = true
        isSharing = true
        lastSent = now
        lastLocation = location
        Task {
            // A failed update is not worth a retry: the next fix replaces it in a few seconds.
            try? await api.sendDriverPosition(body)
            inFlight = false
        }
    }

    /// The trip ended or was cancelled. Tells the server to forget the position.
    func stop() {
        guard isSharing else { return }
        isSharing = false
        lastLocation = nil
        lastSent = .distantPast
        Task { await api.stopDriverSharing() }
    }
}
