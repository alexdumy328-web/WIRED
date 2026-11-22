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

    private let api: APIClient

    init(api: APIClient) {
        self.api = api
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
        } catch APIError.networkError {
            // Offline: keep what we had.
        } catch {
            viewer = nil
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

    func signOut() async {
        // Best effort. The phone forgets the session either way.
        try? await api.requestVoid("POST", "api/auth/sign-out", body: [:])
        api.clearSession()
        viewer = nil
    }

    // MARK: - Errors

    private func call(_ work: @escaping () async throws -> Void) async throws {
        do {
            try await work()
        } catch let APIError.auth(status, code) {
            throw Self.problem(status: status, code: code)
        } catch APIError.networkError {
            throw AuthProblem.offline
        } catch {
            throw AuthProblem.other
        }
    }

    private static func problem(status: Int, code: String?) -> AuthProblem {
        let c = (code ?? "").uppercased()
        if status == 403 || c.contains("NOT_VERIFIED") { return .unverified }
        if status == 429 || c.contains("TOO_MANY") { return .tooMany }
        if c.contains("OTP") || c.contains("INVALID_CODE") || c.contains("EXPIRED") { return .wrongCode }
        if c.contains("ALREADY_EXISTS") || c.contains("USER_ALREADY") { return .exists }
        if c.contains("PASSWORD_TOO") { return .weakPassword }
        if c.contains("MAIL_UNAVAILABLE") || status == 503 { return .mailUnavailable }
        if status == 401 || c.contains("INVALID_EMAIL_OR_PASSWORD") || c.contains("INVALID_PASSWORD") { return .invalidLogin }
        if status == 400 { return .wrongCode }
        return .other
    }
}
