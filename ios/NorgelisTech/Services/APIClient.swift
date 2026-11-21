import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case networkError(Error)
    case invalidResponse(Int)
    case decodingError(Error)
    case serverError(String)
    case notFound

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "URL invalid pentru serverul API."
        case .networkError(let error):
            return "Eroare de rețea: \(error.localizedDescription)"
        case .invalidResponse(let statusCode):
            return "Răspuns server neașteptat (HTTP \(statusCode))."
        case .decodingError(let error):
            return "Eroare la procesarea datelor primite: \(error.localizedDescription)"
        case .serverError(let message):
            return "Eroare server: \(message)"
        case .notFound:
            return "Programarea nu a fost găsită."
        }
    }
}

struct HealthResponse: Codable {
    var ok: Bool
    var store: String?
}

struct BusyDaySummary: Codable, Hashable {
    var total: Int
    var pickups: Int
}

struct BusyDaysResponse: Codable {
    var days: [String: BusyDaySummary]
}

final class APIClient: ObservableObject {
    static let shared = APIClient()

    @Published var baseURLString: String {
        didSet {
            UserDefaults.standard.set(baseURLString, forKey: "norgelis_api_base_url")
        }
    }

    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
        let savedURL = UserDefaults.standard.string(forKey: "norgelis_api_base_url")
        self.baseURLString = savedURL ?? "http://localhost:8787"
    }

    var baseURL: URL? {
        URL(string: baseURLString)
    }

    // MARK: - Public & Customer Endpoints

    func checkHealth() async throws -> HealthResponse {
        guard let url = baseURL?.appendingPathComponent("api/health") else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        try validateResponse(response, data: data)
        return try JSONDecoder().decode(HealthResponse.self, data: data)
    }

    func fetchBooking(code: String) async throws -> Booking {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = baseURL?.appendingPathComponent("api/bookings/\(trimmed)") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await session.data(from: url)
        try validateResponse(response, data: data)
        return try JSONDecoder().decode(Booking.self, data: data)
    }

    func fetchMyBookings() async throws -> [Booking] {
        guard let url = baseURL?.appendingPathComponent("api/me/bookings") else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        try validateResponse(response, data: data)
        return try JSONDecoder().decode([Booking].self, data: data)
    }

    // MARK: - Owner / Admin Endpoints

    func fetchAdminBookings() async throws -> [Booking] {
        guard let url = baseURL?.appendingPathComponent("api/admin/bookings") else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        try validateResponse(response, data: data)
        return try JSONDecoder().decode([Booking].self, data: data)
    }

    func fetchAdminPickups(date: String? = nil) async throws -> [Booking] {
        guard var components = URLComponents(url: baseURL!.appendingPathComponent("api/admin/pickups"), resolvingAgainstBaseURL: true) else {
            throw APIError.invalidURL
        }
        if let date = date {
            components.queryItems = [URLQueryItem(name: "date", value: date)]
        }
        guard let url = components.url else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        try validateResponse(response, data: data)
        return try JSONDecoder().decode([Booking].self, data: data)
    }

    func fetchAdminBusy(from: String, to: String) async throws -> [String: BusyDaySummary] {
        guard var components = URLComponents(url: baseURL!.appendingPathComponent("api/admin/busy"), resolvingAgainstBaseURL: true) else {
            throw APIError.invalidURL
        }
        components.queryItems = [
            URLQueryItem(name: "from", value: from),
            URLQueryItem(name: "to", value: to)
        ]
        guard let url = components.url else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        try validateResponse(response, data: data)
        let decoded = try JSONDecoder().decode(BusyDaysResponse.self, data: data)
        return decoded.days
    }

    func updateBookingStatus(code: String, status: BookingStatus, note: String? = nil) async throws -> Booking {
        guard let url = baseURL?.appendingPathComponent("api/admin/bookings/\(code)/status") else {
            throw APIError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = ["status": status.rawValue]
        if let note = note {
            body["note"] = note
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)
        return try JSONDecoder().decode(Booking.self, data: data)
    }

    // MARK: - Planned Phase 2 Endpoints (Plumbing Prepared)

    func sendDriverLocation(_ payload: DriverLocationPayload) async throws {
        guard let url = baseURL?.appendingPathComponent("api/driver/location") else {
            throw APIError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        request.httpBody = try encoder.encode(payload)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)
    }

    func fetchDriverTracking(bookingCode: String) async throws -> DriverTrackingStatus {
        guard let url = baseURL?.appendingPathComponent("api/bookings/\(bookingCode)/driver") else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        try validateResponse(response, data: data)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(DriverTrackingStatus.self, data: data)
    }

    // MARK: - Helper

    private func validateResponse(_ response: URLResponse, data: Data) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse(0)
        }

        if httpResponse.statusCode == 404 {
            throw APIError.notFound
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let errMsg = errorJson["error"] as? String {
                throw APIError.serverError(errMsg)
            }
            throw APIError.invalidResponse(httpResponse.statusCode)
        }
    }
}
