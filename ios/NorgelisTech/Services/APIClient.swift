import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case networkError(Error)
    case invalidResponse(Int)
    case decodingError(Error)
    case serverError(String)
    case notFound
    case unauthorized
    case forbidden
    case conflict(String)

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
        case .unauthorized:
            return "Nu ești autentificat. Lipește cookie-ul de sesiune în Setări dezvoltare."
        case .forbidden:
            return "Nu ai dreptul să faci această acțiune."
        case .conflict(let code):
            return "Acțiunea nu a putut fi făcută (\(code))."
        }
    }
}

struct HealthResponse: Codable {
    var ok: Bool
    var store: String?
}

/// `shop` is workshop visits with no pickup, `pickup` is shop jobs we collect or deliver, `mobile` is on site.
enum AdminBookingMode: String, CaseIterable {
    case shop, pickup, mobile
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

    /// Dev only. Pastes the Better Auth session cookie so the admin routes answer. Never committed.
    @Published var sessionCookie: String {
        didSet { UserDefaults.standard.set(sessionCookie, forKey: "norgelis_session_cookie") }
    }

    /// Owner console and driver run on built-in sample data until this is off.
    @Published var useMockData: Bool {
        didSet { UserDefaults.standard.set(useMockData, forKey: "norgelis_use_mock") }
    }

    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
        let savedURL = UserDefaults.standard.string(forKey: "norgelis_api_base_url")
        self.baseURLString = savedURL ?? "http://localhost:8787"
        self.sessionCookie = UserDefaults.standard.string(forKey: "norgelis_session_cookie") ?? ""
        self.useMockData = UserDefaults.standard.object(forKey: "norgelis_use_mock") as? Bool ?? true
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
        return try JSONDecoder().decode(HealthResponse.self, from: data)
    }

    func fetchBooking(code: String) async throws -> Booking {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = baseURL?.appendingPathComponent("api/bookings/\(trimmed)") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await session.data(from: url)
        try validateResponse(response, data: data)
        return try JSONDecoder().decode(Booking.self, from: data)
    }

    // MARK: - Authenticated requests (owner console)

    /// Sends a JSON request with the dev session cookie and decodes the answer.
    func request<T: Decodable>(
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        body: [String: Any]? = nil,
        as type: T.Type = T.self
    ) async throws -> T {
        let data = try await send(method, path, query: query, body: body)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Same, for answers nobody reads.
    func requestVoid(_ method: String, _ path: String, query: [URLQueryItem] = [], body: [String: Any]? = nil) async throws {
        _ = try await send(method, path, query: query, body: body)
    }

    /// Downloads a file (a PDF) with the session cookie into a temporary file.
    func download(_ path: String, fileName: String) async throws -> URL {
        let data = try await send("GET", path, query: [], body: nil)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        try data.write(to: url, options: .atomic)
        return url
    }

    private func send(_ method: String, _ path: String, query: [URLQueryItem], body: [String: Any]?) async throws -> Data {
        guard let base = baseURL,
              var components = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: true) else {
            throw APIError.invalidURL
        }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if !sessionCookie.isEmpty { request.setValue(sessionCookie, forHTTPHeaderField: "Cookie") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }
        try validateResponse(response, data: data)
        return data
    }

    func fetchMyBookings() async throws -> [Booking] {
        guard let url = baseURL?.appendingPathComponent("api/me/bookings") else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        try validateResponse(response, data: data)
        return try JSONDecoder().decode([Booking].self, from: data)
    }

    func fetchAdminBusy(from: String, to: String) async throws -> [String: BusyDaySummary] {
        let decoded: BusyDaysResponse = try await request("GET", "api/admin/busy", query: [
            URLQueryItem(name: "from", value: from),
            URLQueryItem(name: "to", value: to),
        ])
        return decoded.days
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
        return try decoder.decode(DriverTrackingStatus.self, from: data)
    }

    // MARK: - Helper

    private func validateResponse(_ response: URLResponse, data: Data) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse(0)
        }

        if httpResponse.statusCode == 404 {
            throw APIError.notFound
        }
        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }
        if httpResponse.statusCode == 403 {
            throw APIError.forbidden
        }
        if httpResponse.statusCode == 409 {
            let code = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError.conflict(code ?? "conflict")
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
