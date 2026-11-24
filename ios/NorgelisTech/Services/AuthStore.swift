import SwiftUI

/// The signed-in person, as `GET /api/me` reports them.
struct Viewer: Codable, Equatable {
    var id: String
    var email: String
    var name: String
    var emailVerified: Bool
    var role: String

    var staffRole: StaffRole? { StaffRole(rawValue: role) }
    var isStaff: Bool { staffRole != nil }
}

/// What went wrong in a sign-in step, in words the person can act on.
enum AuthProblem: Error, Equatable {
    case invalidLogin
    case unverified
    case wrongCode
    case tooMany
    case exists
    case weakPassword
    case mailUnavailable
    case offline
    case unavailable
    /// The session is too old to delete the account. Sign in again, or give the password.
    case reauth
    case staffAccount
    case other

    var key: String {
        switch self {
        case .invalidLogin: return "auth.error.invalid_login"
        case .unverified: return "auth.error.unverified"
        case .wrongCode: return "auth.error.wrong_code"
        case .tooMany: return "auth.error.too_many"
        case .exists: return "auth.error.exists"
        case .weakPassword: return "auth.error.weak_password"
        case .mailUnavailable: return "auth.error.mail_unavailable"
        case .offline: return "auth.error.offline"
        case .unavailable: return "auth.error.unavailable"
        case .reauth: return "auth.error.reauth"
        case .staffAccount: return "auth.error.staff_account"
        case .other: return "auth.error.generic"
        }
    }
}

/// Sign-in, sign-up, email confirmation and password reset against the same Better Auth routes the site uses.
@MainActor
final class AuthStore: ObservableObject {
    @Published private(set) var viewer: Viewer?
    @Published private(set) var googleAvailable = false
    @Published private(set) var loaded = false
    /// There is a saved session but the server could not be reached, so who is signed in is not known yet.
    @Published private(set) var needsRetry = false

    private let api: APIClient

    private var sessionObserver: NSObjectProtocol?

    init(api: APIClient) {
        self.api = api
        // The server said the saved session is no good. Drop it here too.
        sessionObserver = NotificationCenter.default.addObserver(forName: .sessionExpired, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
    }

    var isSignedIn: Bool { viewer != nil }

    private struct MeResponse: Decodable {
        struct Providers: Decodable { var google: Bool? }
        var user: Viewer?
        var providers: Providers?
    }

    /// Reads who the server thinks we are. A rejected or missing session clears the saved cookies.
    func refresh() async {
        do {
            let me: MeResponse = try await api.request("GET", "api/me")
            viewer = me.user
            googleAvailable = me.providers?.google ?? false
            if me.user == nil { api.clearSession() }
            // Sample data is a tool for owners and devs. Nobody else keeps it on.
            if me.user?.staffRole?.isManager != true { api.disableSample() }
            needsRetry = false
        } catch APIError.networkError {
            // Offline: keep what we had. With a saved session and nobody known yet, ask to try again
            // instead of showing the sign-in screen to someone who is signed in.
            needsRetry = viewer == nil && api.hasSession
        } catch APIError.unauthorized {
            viewer = nil
            needsRetry = false
            api.disableSample()
            api.clearSession()
        } catch is CancellationError {
            // A newer refresh is running.
        } catch {
            viewer = nil
            needsRetry = false
        }
        loaded = true
    }

    // MARK: - Steps

    func sendSignInCode(email: String) async throws {
        try await call { try await self.api.requestVoid("POST", "api/auth/email-otp/send-verification-otp", body: ["email": email, "type": "sign-in"]) }
    }

    func signIn(email: String, code: String) async throws {
        try await call { try await self.api.requestVoid("POST", "api/auth/sign-in/email-otp", body: ["email": email, "otp": code]) }
        await refresh()
    }

    func signIn(email: String, password: String) async throws {
        try await call { try await self.api.requestVoid("POST", "api/auth/sign-in/email", body: ["email": email, "password": password]) }
        await refresh()
    }

    func signUp(name: String, email: String, password: String) async throws {
        try await call { try await self.api.requestVoid("POST", "api/auth/sign-up/email", body: ["name": name, "email": email, "password": password]) }
    }

    func sendConfirmation(email: String) async throws {
        try await call { try await self.api.requestVoid("POST", "api/auth/email-otp/send-verification-otp", body: ["email": email, "type": "email-verification"]) }
    }

    func confirm(email: String, code: String) async throws {
        try await call { try await self.api.requestVoid("POST", "api/auth/email-otp/verify-email", body: ["email": email, "otp": code]) }
        await refresh()
    }

    func requestReset(email: String) async throws {
        try await call { try await self.api.requestVoid("POST", "api/auth/email-otp/request-password-reset", body: ["email": email]) }
    }

    func reset(email: String, code: String, password: String) async throws {
        try await call { try await self.api.requestVoid("POST", "api/auth/email-otp/reset-password", body: ["email": email, "otp": code, "password": password]) }
    }

    /// Signs out on this phone either way. Returns false when the server could not end the session,
    /// so the person knows it may still be valid elsewhere.
    @discardableResult
    func signOut() async -> Bool {
        var ended = true
        do {
            try await api.requestVoid("POST", "api/auth/sign-out", body: [:])
        } catch {
            ended = false
        }
        api.clearSession()
        api.disableSample()
        api.resetServer()
        viewer = nil
        return ended
    }

    /// Deletes the signed-in account on the server, then signs out here. Needs the server to allow it
    /// (Better Auth `user.deleteUser`); without that the route is missing and this throws `.unavailable`.
    func deleteAccount(password: String? = nil) async throws {
        struct Reply: Decodable { var success: Bool?; var message: String? }
        var body: [String: Any] = [:]
        if let password, !password.isEmpty { body["password"] = password }
        let reply: Reply = try await callValue { try await self.api.request("POST", "api/auth/delete-user", body: body) }
        // The server may answer 200 with "Verification email sent" and delete nothing. Only "User deleted" counts.
        guard reply.success == true, reply.message == "User deleted" else { throw AuthProblem.unavailable }
        api.clearSession()
        api.disableSample()
        api.resetServer()
        viewer = nil
    }

    // MARK: - Errors

    private func call(_ work: @escaping () async throws -> Void) async throws {
        _ = try await callValue { try await work() }
    }

    private func callValue<T>(_ work: @escaping () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch let APIError.auth(status, code) {
            throw Self.problem(status: status, code: code)
        } catch APIError.networkError {
            throw AuthProblem.offline
        } catch {
            throw AuthProblem.other
        }
    }

    nonisolated static func problem(status: Int, code: String?) -> AuthProblem {
        let c = (code ?? "").uppercased()
        // Match the code first: Better Auth also answers 403 for too many attempts and for a refused Origin.
        if c.contains("ORIGIN") { return .other }
        if status == 404 { return .unavailable }
        if c.contains("STAFF_ACCOUNT") { return .staffAccount }
        if c.contains("SESSION_EXPIRED") || c.contains("SESSION_NOT_FRESH") { return .reauth }
        if status == 429 || c.contains("TOO_MANY") { return .tooMany }
        if c.contains("NOT_VERIFIED") { return .unverified }
        if c.contains("OTP") || c.contains("INVALID_CODE") || c.contains("EXPIRED") { return .wrongCode }
        if c.contains("ALREADY_EXISTS") || c.contains("USER_ALREADY") { return .exists }
        if c.contains("PASSWORD_TOO") { return .weakPassword }
        if c.contains("MAIL_UNAVAILABLE") || status == 503 { return .mailUnavailable }
        if status == 401 || c.contains("INVALID_EMAIL_OR_PASSWORD") || c.contains("INVALID_PASSWORD") { return .invalidLogin }
        return .other
    }
}
