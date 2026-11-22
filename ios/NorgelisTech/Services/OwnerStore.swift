import SwiftUI

/// Shared state for the owner console: who is signed in, which repository to use, and a counter
/// that screens watch so they reload after something changes.
@MainActor
final class OwnerStore: ObservableObject {
    enum Tab: Hashable {
        case today, jobs, customers, schedule, more
    }

    @Published var role: StaffRole = .dev
    @Published var tab: Tab = .today
    @Published var counts: StaffCounts?
    /// Bumped on every write. Screens reload when it changes.
    @Published private(set) var version = 0
    /// Set by the Today tab to open the Jobs tab on a filter.
    @Published var jobsFilter: String?
    @Published var lastError: String?

    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    var repo: OwnerRepository {
        api.useMockData ? MockOwnerRepository.shared : LiveOwnerRepository(api: api)
    }

    var isLive: Bool { !api.useMockData }

    /// Reads the role (live) or applies the dev's pick (sample data), then loads the counts.
    func bootstrap() async {
        lastError = nil
        if api.useMockData {
            await MockOwnerRepository.shared.setRole(role)
        } else {
            do {
                role = try await repo.role()
            } catch {
                lastError = error.localizedDescription
            }
        }
        await refreshCounts()
    }

    func chooseMockRole(_ newRole: StaffRole) {
        role = newRole
        Task {
            await MockOwnerRepository.shared.setRole(newRole)
            changed()
        }
    }

    func refreshCounts() async {
        counts = try? await repo.counts()
    }

    /// Call after any write.
    func changed() {
        version += 1
        Task { await refreshCounts() }
    }

    func openJobs(status: String?) {
        jobsFilter = status
        tab = .jobs
    }
}
