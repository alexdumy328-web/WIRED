import Foundation

/// Values the owner sets on the server (Vercel env: FEEDBACK_URL, SUPPORT_EMAIL) so they change without a new
/// build. Read from `GET /api/config` at launch and kept for the next offline start. The build settings stay as
/// the fallback when the server has none.
@MainActor
final class RemoteConfig: ObservableObject {
    static let shared = RemoteConfig()

    struct Values: Codable, Equatable {
        var feedbackUrl: String?
        var supportEmail: String?
    }

    @Published private(set) var values: Values

    private static let storeKey = "norgelis_remote_config"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        values = (defaults.data(forKey: Self.storeKey)).flatMap { try? JSONDecoder().decode(Values.self, from: $0) } ?? Values()
    }

    var feedbackURL: URL? {
        guard let raw = values.feedbackUrl, let url = URL(string: raw), url.scheme == "https" else { return nil }
        return url
    }

    var supportEmail: String? { values.supportEmail.flatMap { $0.contains("@") ? $0 : nil } }

    func refresh(api: APIClient = .shared) async {
        guard let next: Values = try? await api.request("GET", "api/config") else { return }
        apply(next)
    }

    func apply(_ next: Values) {
        guard next != values else { return }
        values = next
        if let data = try? JSONEncoder().encode(next) { defaults.set(data, forKey: Self.storeKey) }
    }

    /// A different server has different settings.
    func clear() { apply(Values()) }
}
