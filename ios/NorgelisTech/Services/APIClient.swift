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
    /// A refused sign-in call. `code` is Better Auth's error code, when it sent one.
    case auth(status: Int, code: String?)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return String(localized: "error.invalid_url")
        case .networkError(let error):
            return String(format: String(localized: "error.network"), error.localizedDescription)
        case .invalidResponse(let statusCode):
            return String(format: String(localized: "error.invalid_response"), statusCode)
        case .decodingError(let error):
            return String(format: String(localized: "error.decoding"), error.localizedDescription)
        case .serverError(let message):
            return String(format: String(localized: "error.server"), message)
        case .notFound:
            return String(localized: "error.not_found")
        case .unauthorized:
            return String(localized: "error.unauthorized")
        case .forbidden:
            return String(localized: "error.forbidden")
        case .auth(let status, _):
            return String(format: String(localized: "error.auth"), status)
        case .conflict(let code):
            return String(format: String(localized: "error.conflict"), code)
        }
    }
}

extension Notification.Name {
    /// The server refused a saved session. The auth store reacts by signing out here too.
    static let sessionExpired = Notification.Name("norgelis.sessionExpired")
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
            // A saved session belongs to one server. Never send it to another address.
            if Self.origin(of: oldValue) != Self.origin(of: baseURLString) {
                clearSession()
                // The signed-in person belonged to the old server. Let the auth state catch up.
                NotificationCenter.default.post(name: .sessionExpired, object: nil)
            }
        }
    }

    /// Owners and devs can switch the console and driver map to built-in sample data. Off at every launch, and cleared at sign-out.
    @Published var useMockData = false

    /// Turns sample data off without announcing a change when it was already off.
    func disableSample() {
        if useMockData { useMockData = false }
    }

    /// Release builds talk to HTTPS servers only. Debug builds also take plain HTTP for a local server.
    static func isAllowedServer(_ address: String, allowHTTP: Bool = APIClient.isDebugBuild) -> Bool {
        guard let url = URL(string: address), let scheme = url.scheme?.lowercased(), url.host != nil else { return false }
        return scheme == "https" || (allowHTTP && scheme == "http")
    }

    static var isDebugBuild: Bool {
        #if DEBUG
        return true
        #else
        return false
        #endif
    }

    /// Back to the address this build was made for. Used at sign-out, so a staging address never outlives its owner.
    func resetServer() {
        if baseURLString != Self.buildDefaultURL { baseURLString = Self.buildDefaultURL }
    }

    private let session: URLSession

    // MARK: - Session cookies

    /// Better Auth cookies from the last sign-in. Kept in the Keychain, sent by hand on every call.
    private var cookies: [String: String]
    private let cookieLock = NSLock()
    private static let cookieAccount = "cookies"

    private static func loadCookies() -> [String: String] {
        guard let data = Keychain.load(account: cookieAccount),
              let dict = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
        return dict
    }

    private func persistCookies() {
        if cookies.isEmpty {
            Keychain.delete(account: Self.cookieAccount)
        } else if let data = try? JSONEncoder().encode(cookies) {
            Keychain.save(data, account: Self.cookieAccount)
        }
    }

    var hasSession: Bool {
        cookieLock.lock(); defer { cookieLock.unlock() }
        return cookies.keys.contains { $0.hasSuffix("session_token") }
    }

    func clearSession() {
        cookieLock.lock(); defer { cookieLock.unlock() }
        cookies = [:]
        persistCookies()
    }

    private var cookieHeader: String {
        cookieLock.lock(); defer { cookieLock.unlock() }
        return cookies.map { "\($0.key)=\($0.value)" }.sorted().joined(separator: "; ")
    }

    private func store(from response: HTTPURLResponse, url: URL) {
        let fields = response.allHeaderFields.reduce(into: [String: String]()) { out, pair in
            if let k = pair.key as? String, let v = pair.value as? String { out[k] = v }
        }
        cookieLock.lock(); defer { cookieLock.unlock() }
        var changed = false
        for cookie in HTTPCookie.cookies(withResponseHeaderFields: fields, for: url) {
            let expired = cookie.value.isEmpty || (cookie.expiresDate.map { $0 < Date() } ?? false)
            if expired { changed = cookies.removeValue(forKey: cookie.name) != nil || changed }
            else { cookies[cookie.name] = cookie.value; changed = true }
        }
        if changed { persistCookies() }
    }

    /// "scheme://host:port" of an address, or nil.
    private static func origin(of address: String) -> String? {
        guard let url = URL(string: address), let scheme = url.scheme, let host = url.host else { return nil }
        return url.port.map { "\(scheme)://\(host):\($0)" } ?? "\(scheme)://\(host)"
    }

    /// The Origin Better Auth must see. It only accepts the website's own origin (BETTER_AUTH_URL or APP_ORIGINS),
    /// which a build sets as NORGELIS_SITE_ORIGIN. Without it the API's own address is the best guess.
    private var originString: String? {
        // The build's site origin belongs to the build's own server. Another address gets its own origin.
        if let site = Bundle.main.object(forInfoDictionaryKey: "NorgelisSiteOrigin") as? String, !site.isEmpty,
           Self.origin(of: baseURLString) == Self.origin(of: Self.buildDefaultURL) {
            return Self.origin(of: site)
        }
        return Self.origin(of: baseURLString)
    }

    init(session: URLSession = .shared) {
        self.session = session
        // A saved address from another build (plain HTTP from a Debug build, say) must not break this one.
        let savedURL = UserDefaults.standard.string(forKey: "norgelis_api_base_url").flatMap { Self.isAllowedServer($0) ? $0 : nil }
        self.baseURLString = savedURL ?? Self.buildDefaultURL

        self.cookies = Self.loadCookies()
    }

    /// The build's default address (`NorgelisAPIBaseURL` in Info.plist), else the production site.
    private static var buildDefaultURL: String {
        let configured = Bundle.main.object(forInfoDictionaryKey: "NorgelisAPIBaseURL") as? String
        return configured.flatMap { $0.isEmpty ? nil : $0 } ?? "https://norgelis.ro"
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
        // Codes look like NT-4K7Q. Anything else cannot exist, and must not reach the URL path.
        guard trimmed.range(of: "^[A-Za-z0-9-]{3,20}$", options: .regularExpression) != nil else { throw APIError.notFound }
        return try await request("GET", "api/bookings/\(trimmed)")
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
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // Emails are written in this language.
        request.setValue(Locale.current.language.languageCode?.identifier == "en" ? "en" : "ro", forHTTPHeaderField: "x-nt-lang")
        let header = cookieHeader
        if !header.isEmpty {
            request.setValue(header, forHTTPHeaderField: "Cookie")
            // Better Auth checks the Origin of calls that carry cookies. A phone has no page origin, so use the API's own.
            if path.hasPrefix("api/auth"), let origin = originString { request.setValue(origin, forHTTPHeaderField: "Origin") }
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            // A superseded request is not a network problem.
            if (error as? URLError)?.code == .cancelled { throw CancellationError() }
            throw APIError.networkError(error)
        }
        if let http = response as? HTTPURLResponse {
            // A reply from before the base URL changed must not put its cookies back.
            if Self.origin(of: url.absoluteString) == Self.origin(of: baseURLString) { store(from: http, url: url) }
            if http.statusCode == 401, !path.hasPrefix("api/auth"), hasSession {
                clearSession()
                NotificationCenter.default.post(name: .sessionExpired, object: nil)
            }
            if path.hasPrefix("api/auth"), !(200...299).contains(http.statusCode) {
                let code = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["code"] as? String
                    ?? (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
                throw APIError.auth(status: http.statusCode, code: code)
            }
        }
        try validateResponse(response, data: data)
        return data
    }

    func fetchMyBookings() async throws -> [Booking] {
        struct Envelope: Decodable { var bookings: [Booking] }
        let reply: Envelope = try await request("GET", "api/me/bookings")
        return reply.bookings
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
